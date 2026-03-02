#!/usr/bin/env node
import { runDeploy } from "./deploy-all-stores.js";
import { BaseOptionsSchema, publishOnlyDescription } from "./store-argument-parser.js";
import { ChromeTokenOptionsSchema, runChromeToken } from "./stores/chrome/chrome-token.js";
import { getStoreDisplayName, storeRegistry } from "./stores/registry.js";
import { buildHelpTableData, renderApplicationError, renderHelpTables } from "./ui/ink-logger.js";
import { kebabCase } from "./utils/case-conversion.js";
import { toError } from "./utils/retry.js";
import { getZodBaseType, getZodDescription, isZodOptional, unwrapZod } from "./utils/zod.js";
import yargs, { type Arguments, type Options } from "yargs";
import { z } from "zod";

function schemaToOptions(store: string | "base", schema: z.ZodTypeAny, demandRequired = false) {
  const options: Record<string, Options> = {};
  if (!(schema instanceof z.ZodObject)) {
    return options;
  }

  for (const [key, value] of Object.entries(schema.shape)) {
    if (key === "verbose" && store !== "base") {
      continue;
    }
    const optionName = store === "base" ? kebabCase(key) : `${store}-${kebabCase(key)}`;
    const isOptional = isZodOptional(value);
    const type = getZodBaseType(unwrapZod(value));
    const description = getZodDescription(value);
    options[optionName] = {
      type,
      description: !isOptional && store !== "base" ? `${description} [required]`.trim() : description,
      ...(demandRequired && !isOptional && { demandOption: true })
    };
  }

  return options;
}

const allStoreOptions: Record<string, Options> = {};
const envOverrideStoreOptions: Record<string, Options> = {};
const storeOptionGroups: Record<string, string[]> = {};
for (const store of storeRegistry) {
  const options = schemaToOptions(store.name, store.schema);
  Object.assign(allStoreOptions, options);
  storeOptionGroups[store.name] = Object.keys(options);
  // In env mode, dynamic fields and cliOverridableFields are registered so yargs can parse
  // them, but all are hidden from the option list — the epilogue tables show everything.
  const envCliOptionNames = new Set([
    ...(store.dynamicFields ?? []).map(key => `${store.name}-${kebabCase(key)}`),
    ...(store.cliOverridableFields ?? []).map(key => `${store.name}-${kebabCase(key)}`)
  ]);
  const envOptions = Object.fromEntries(
    Object.entries(options)
      .filter(([key]) => envCliOptionNames.has(key))
      .map(([key, option]) => [key, { ...option, description: (option.description ?? "").replace(" [required]", "") }])
  );
  Object.assign(envOverrideStoreOptions, envOptions);
}

const baseOptions = schemaToOptions("base", BaseOptionsSchema);

function applyStoreGroups(builder: ReturnType<typeof yargs>, groups: Record<string, string[]> = storeOptionGroups) {
  for (const [store, keys] of Object.entries(groups)) {
    builder = builder.group(keys, `${getStoreDisplayName(store)}:`);
  }
  return builder;
}

function stripCamelCaseArgs(message: string) {
  return message.replace(
    /Unknown arguments?: (.+)/,
    (_, args: string) => {
      const kebabOnly = args.split(", ").filter(arg => arg.includes("-"));
      const label = kebabOnly.length === 1 ? "Unknown argument" : "Unknown arguments";
      return `${label}: ${kebabOnly.map(arg => `--${arg}`).join(", ")}`;
    }
  );
}

export const parser = yargs(process.argv.slice(2))
  .scriptName("web-ext-deploy")
  .usage("$0 <command> [options]")
  .wrap(process.stdout.columns)
  .command(
    "env",
    "Read from .env files",
    builder => {
      builder = builder.options({
        ...baseOptions,
        "publish-only": {
          type: "array",
          description: publishOnlyDescription
        },
        ...envOverrideStoreOptions
      });
      for (const name in envOverrideStoreOptions) {
        builder = builder.hide(name);
      }
      return builder.version(false).epilogue("Create a .env file for each store you want to deploy to (e.g. chrome.env, firefox.env)\n" +
        "Required fields go in the .env file; dynamic fields are passed as CLI arguments");
    },
    handleDeploy
  )
  .command(
    "cli",
    "Pass arguments directly",
    builder => {
      builder = builder.options({ ...baseOptions, ...allStoreOptions });
      builder = applyStoreGroups(builder);
      return builder.version(false).epilogue("Choose which stores to deploy to by supplying their options\n" +
        "Only stores with at least one argument will be included\n" +
        "For each included store, all [required] options must be provided");
    },
    handleDeploy
  )
  .command(
    "chrome-token",
    "Get a Chrome Web Store refresh token",
    builder => builder.version(false).options(schemaToOptions("base", ChromeTokenOptionsSchema, true)),
    handleChromeToken
  )
  .demandCommand(1, "You need at least one command before moving on")
  .epilogue(`Run "web-ext-deploy env --help" or "web-ext-deploy cli --help" for store-specific options`)
  .strict()
  .fail((message, _error, instance) => {
    if (message) {
      instance.showHelp();
      console.error(`\n${stripCamelCaseArgs(message)}`);
      process.exit(1);
    }
  })
  .exitProcess(false)
  .help();

async function handleCommand(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    await renderApplicationError(toError(error));
    process.exit(1);
  }
}

function handleChromeToken(argv: Arguments) {
  return handleCommand(() => {
    const { clientId, clientSecret, printOnly } = ChromeTokenOptionsSchema.parse(argv);
    return runChromeToken(clientId, clientSecret, printOnly);
  });
}

function handleDeploy(argv: Arguments) {
  return handleCommand(() => runDeploy(argv));
}

async function init() {
  const argv = await parser.parseAsync();
  if (argv.help) {
    const command = z.string().safeParse(argv._[0]).data;
    if (command === "env") {
      const tables = storeRegistry
        .map(store => buildHelpTableData(store.name, store.schema, "env", undefined, store.dynamicFields, store.cliOverridableFields))
        .filter(table => table !== null);
      await renderHelpTables(tables);
    }
    process.exit(0);
  }
}

init();
