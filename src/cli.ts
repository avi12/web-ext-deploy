#!/usr/bin/env node
import { runDeploy } from "./deploy-all-stores.js";
import { BaseOptionsSchema, EnvOptionsSchema } from "./store-argument-parser.js";
import { storeRegistry } from "./stores/registry.js";
import type { Arguments, StoreName } from "./types.js";
import {
  type HelpTableData,
  buildHelpTableData,
  renderApplicationError,
  renderHelpTables,
  unwrapZodType
} from "./ui/ink-logger.js";
import { camelCase, kebabCase } from "./utils/case-conversion.js";
import { toError } from "./utils/retry.js";
import { getZodBaseType, isZodOptional, unwrapZod, zodObjectEntries } from "./utils/zod.js";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { z } from "zod";

type Command = "cli" | "env";
type CliOptionType = "boolean" | "number" | "string" | "array";
type CliOptionSpecs = Record<string, CliOptionType>;

const PUBLISH_ONLY_FLAG = "publish-only";

const COMMANDS: Record<Command, { summary: string; epilogue: string }> = {
  env: {
    summary: "Read configuration from .env files",
    epilogue: "Create a .env file for each store you want to deploy to (e.g. chrome.env, firefox.env)\n" +
      "Required fields go in the .env file; dynamic fields are passed as CLI arguments"
  },
  cli: {
    summary: "Pass configuration directly as CLI arguments",
    epilogue: "Choose which stores to deploy to by supplying their options\n" +
      "Only stores with at least one argument will be included\n" +
      "For each included store, all [required] options must be provided"
  }
};

const TOP_LEVEL_HELP = `Usage: web-ext-deploy <command> [options]

Commands:
  env   ${COMMANDS.env.summary}
  cli   ${COMMANDS.cli.summary}

Options:
  --help     Show help
  --version  Show version number

Run "web-ext-deploy env --help" or "web-ext-deploy cli --help" for store-specific options`;

// Base options keep their plain kebab-case name; store options are prefixed with the store.
function optionName(scope: StoreName | "base", key: string) {
  return scope === "base" ? kebabCase(key) : `${scope}-${kebabCase(key)}`;
}

function schemaToSpecs(scope: StoreName | "base", schema: z.ZodObject<z.ZodRawShape>) {
  const specs: CliOptionSpecs = {};
  for (const [key, value] of zodObjectEntries(schema)) {
    const isVerboseOnStore = key === "verbose" && scope !== "base";
    if (isVerboseOnStore) {
      continue;
    }

    specs[optionName(scope, key)] = getZodBaseType(unwrapZod(value));
  }
  return specs;
}

function pickEnvOverridableSpecs(store: typeof storeRegistry[number], storeSpecs: CliOptionSpecs) {
  const overridable = new Set([
    ...(store.dynamicFields ?? []).map(field => optionName(store.name, field)),
    ...(store.cliOverridableFields ?? []).map(field => optionName(store.name, field))
  ]);
  return Object.fromEntries(Object.entries(storeSpecs).filter(([name]) => overridable.has(name)));
}

const baseSpecs = schemaToSpecs("base", BaseOptionsSchema);
const allStoreSpecs: CliOptionSpecs = {};
const envOverridableSpecs: CliOptionSpecs = {};
for (const store of storeRegistry) {
  const storeSpecs = schemaToSpecs(store.name, store.schema);
  Object.assign(allStoreSpecs, storeSpecs);
  Object.assign(envOverridableSpecs, pickEnvOverridableSpecs(store, storeSpecs));
}

// Valid options differ per command: `cli` accepts every store flag, while `env`
// reads required fields from .env files and only accepts the global flags plus
// the dynamic/overridable store flags.
const cliCommandSpecs: CliOptionSpecs = { ...baseSpecs, ...allStoreSpecs };
const envCommandSpecs: CliOptionSpecs = { ...baseSpecs, [PUBLISH_ONLY_FLAG]: "array", ...envOverridableSpecs };

function isChangelogField(fieldName: string) {
  return fieldName.toLowerCase().endsWith("changelog");
}

const changelogFlagNames = storeRegistry.flatMap(store =>
  Object.keys(store.schema instanceof z.ZodObject ? store.schema.shape : {})
    .filter(isChangelogField)
    .map(field => `--${optionName(store.name, field)}`)
);

function greedyFlagKind(token: string) {
  if (changelogFlagNames.includes(token)) {
    return "changelog";
  }

  if (token === `--${PUBLISH_ONLY_FLAG}`) {
    return "array";
  }

  return null;
}

function splitAtNextFlag(tokens: string[]) {
  const nextFlagOffset = tokens.findIndex(token => token.startsWith("--"));
  const splitPoint = nextFlagOffset === -1 ? tokens.length : nextFlagOffset;
  return [tokens.slice(0, splitPoint), tokens.slice(splitPoint)] as const;
}

// Build the `--flag=value` token(s) for one greedy flag and the values collected for it.
function expandGreedyValues(flag: string, kind: "changelog" | "array", values: string[]) {
  if (values.length === 0) {
    return [flag];
  }

  if (kind === "array") {
    return values.map(value => `${flag}=${value}`);
  }

  // Join with the literal "\n" that the changelog schema later turns into real newlines.
  return [`${flag}=${values.join("\\n")}`];
}

// `parseArgs` only accepts `--flag value` or `--flag=value`, so collapse the
// greedy forms yargs used to support: a changelog spread over several words, or
// `--publish-only chrome firefox`. Values are taken up to the next `--flag`,
// which lets changelog bullets that start with a single `-` be captured.
function expandGreedyFlags(args: string[]) {
  const result: string[] = [];
  let remaining = args;
  while (remaining.length > 0) {
    const [head, ...rest] = remaining;
    const greedyKind = greedyFlagKind(head);
    if (!greedyKind) {
      result.push(head);
      remaining = rest;
      continue;
    }

    const [values, afterValues] = splitAtNextFlag(rest);
    result.push(...expandGreedyValues(head, greedyKind, values));
    remaining = afterValues;
  }
  return result;
}

function toParseArgsOptions(specs: CliOptionSpecs) {
  const options: Record<string, { type: "boolean" | "string"; multiple?: boolean }> = {};
  for (const [name, type] of Object.entries(specs)) {
    options[name] = {
      type: type === "boolean" ? "boolean" : "string",
      ...(type === "array" && { multiple: true })
    };
  }
  return options;
}

function coerceOptionValue(value: unknown, type: CliOptionType) {
  if (type === "number") {
    return Number(value);
  }

  return value;
}

function buildArguments(command: Command, values: Record<string, unknown>, specs: CliOptionSpecs): Arguments {
  const argv: Arguments = { _: [command] };
  for (const [name, rawValue] of Object.entries(values)) {
    const value = coerceOptionValue(rawValue, specs[name]);
    argv[name] = value;
    argv[camelCase(name)] = value;
  }
  return argv;
}

function parseCommandArgs(command: Command, args: string[]) {
  const specs = command === "cli" ? cliCommandSpecs : envCommandSpecs;
  const { values } = parseArgs({
    args,
    options: toParseArgsOptions(specs),
    strict: true,
    allowPositionals: false
  });
  return buildArguments(command, values, specs);
}

function buildGlobalHelpTable(command: Command): HelpTableData {
  const schema: z.ZodObject<z.ZodRawShape> = command === "env" ? EnvOptionsSchema : BaseOptionsSchema;
  const fields = zodObjectEntries(schema).map(([key, value]) => {
    const { type, defaultValue, description } = unwrapZodType(value);
    return {
      name: `--${kebabCase(key)}`,
      type,
      isRequired: !isZodOptional(value),
      defaultValue,
      description
    };
  });
  return { title: "Global Options", fields };
}

async function renderCommandHelp(command: Command) {
  console.log(`Usage: web-ext-deploy ${command} [options]\n\n${COMMANDS[command].summary}`);
  const storeTables = storeRegistry.flatMap(store => {
    const table = buildHelpTableData(store.name, store.schema, command, undefined, store.dynamicFields, store.cliOverridableFields);
    return table ? [table] : [];
  });
  await renderHelpTables([...storeTables, buildGlobalHelpTable(command)]);
  console.log(`\n${COMMANDS[command].epilogue}`);
}

function printVersion() {
  const require = createRequire(import.meta.url);
  const { version } = z.object({ version: z.string() }).parse(require("../package.json"));
  console.log(version);
}

async function handleDeploy(argv: Arguments) {
  try {
    await runDeploy(argv);
  } catch (error) {
    await renderApplicationError(toError(error));
    process.exit(1);
  }
}

function isHelpFlag(token: string) {
  return token === "--help" || token === "-h";
}

function isKnownCommand(value: string): value is Command {
  return value === "cli" || value === "env";
}

function unknownCommandMessage(command: string) {
  if (!command || command.startsWith("-")) {
    return "You need at least one command before moving on";
  }

  return `Unknown command: ${command}`;
}

type Invocation =
  | { kind: "top-help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "run"; command: Command; commandArgs: string[] };

const topLevelFlagInvocations: Record<string, Invocation> = {
  "--help": { kind: "top-help" },
  "-h": { kind: "top-help" },
  "--version": { kind: "version" }
};

function resolveInvocation(args: string[]): Invocation {
  const [command = ""] = args;
  const topLevelFlag = topLevelFlagInvocations[command];
  if (topLevelFlag) {
    return topLevelFlag;
  }

  if (!isKnownCommand(command)) {
    return { kind: "error", message: unknownCommandMessage(command) };
  }

  return { kind: "run", command, commandArgs: args.slice(1) };
}

async function runCommand(command: Command, commandArgs: string[]) {
  if (commandArgs.some(isHelpFlag)) {
    await renderCommandHelp(command);
    return;
  }

  let argv: Arguments;
  try {
    argv = parseCommandArgs(command, commandArgs);
  } catch (error) {
    const message = toError(error).message.replace(/\. To specify a positional.*$/s, "");
    console.error(`${message}\n\nRun "web-ext-deploy ${command} --help" for available options`);
    process.exitCode = 1;
    return;
  }

  await handleDeploy(argv);
}

async function main() {
  const invocation = resolveInvocation(expandGreedyFlags(process.argv.slice(2)));
  if (invocation.kind === "top-help") {
    console.log(TOP_LEVEL_HELP);
    return;
  }

  if (invocation.kind === "version") {
    printVersion();
    return;
  }

  if (invocation.kind === "error") {
    console.error(`${TOP_LEVEL_HELP}\n\n${invocation.message}`);
    process.exitCode = 1;
    return;
  }

  await runCommand(invocation.command, invocation.commandArgs);
}

await main();
