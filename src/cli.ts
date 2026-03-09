#!/usr/bin/env node
import { runDeploy } from "./deploy-all-stores.js";
import { BaseOptionsSchema, publishOnlyDescription } from "./store-argument-parser.js";
import { ChromeTokenOptionsSchema, runChromeToken } from "./stores/chrome/chrome-token.js";
import { getStoreDisplayName, storeRegistry } from "./stores/registry.js";
import { type StoreDefinition, StoreName } from "./types.js";
import { buildHelpTableData, renderApplicationError, renderHelpTables } from "./ui/ink-logger.js";
import { type CamelToKebab, kebabCase } from "./utils/case-conversion.js";
import { toError } from "./utils/retry.js";
import { getZodBaseType, getZodDescription, isZodOptional, unwrapZod } from "./utils/zod.js";
import yargs, { type Arguments, type Options } from "yargs";
import { z } from "zod";

type ExtractSchemaKeys<T> = T extends z.ZodObject<infer Shape> ? string & keyof Shape : never;

type StoreCliOptionKeys<Store extends typeof storeRegistry[number]> =
  `${Store["name"]}-${CamelToKebab<ExtractSchemaKeys<Store["schema"]>>}`;

type AllCliOptionKeys = StoreCliOptionKeys<typeof storeRegistry[number]>;

function schemaToOptions<Key extends string>(store: StoreName | "base", schema: z.ZodObject<Record<Key, z.ZodTypeAny>>, demandRequired = false) {
  const options: Record<string, Options> = {};

  for (const [key, value] of Object.entries(schema.shape)) {
    if (key === "verbose" && store !== "base") {
      continue;
    }
    const optionName = store === "base" ? kebabCase(key) : `${store}-${kebabCase(key)}`;
    const isOptional = isZodOptional(value);
    const description = getZodDescription(value);
    options[optionName] = {
      type: getZodBaseType(unwrapZod(value)),
      description: !isOptional && store !== "base" ? `${description} [required]`.trim() : description,
      ...(demandRequired && !isOptional && { demandOption: true })
    };
  }

  return options;
}

function buildEnvModeCliOnlyOptions(store: StoreDefinition, allOptions: Record<string, Options>) {
  const cliOverridableInEnvMode = new Set([
    ...(store.dynamicFields ?? []).map(key => `${store.name}-${kebabCase(key)}`),
    ...(store.cliOverridableFields ?? []).map(key => `${store.name}-${kebabCase(key)}`)
  ]);
  return Object.fromEntries(
    Object.entries(allOptions)
      .filter(([key]) => cliOverridableInEnvMode.has(key))
      .map(([key, option]) => [key, { ...option, description: (option.description ?? "").replace(" [required]", "") }])
  );
}

let allStoreOptions: Partial<Record<AllCliOptionKeys, Options>> = {};
const storeOptionGroups: Partial<Record<StoreName, string[]>> = {};
let envModeCliOnlyOptions: Partial<Record<AllCliOptionKeys, Options>> = {};

for (const store of storeRegistry) {
  const storeOptions = schemaToOptions<string>(store.name, store.schema);
  allStoreOptions = { ...allStoreOptions, ...storeOptions };
  storeOptionGroups[store.name] = Object.keys(storeOptions);
  envModeCliOnlyOptions = { ...envModeCliOnlyOptions, ...buildEnvModeCliOnlyOptions(store, storeOptions) };
}

const baseOptions = schemaToOptions("base", BaseOptionsSchema);

function applyStoreGroups(builder: ReturnType<typeof yargs>, groups: Partial<Record<StoreName, string[]>> = storeOptionGroups) {
  for (const { name } of storeRegistry) {
    const keys = groups[name];
    if (!keys) {
      continue;
    }
    builder.group(keys, `${getStoreDisplayName(name)}:`);
  }
  return builder;
}

function stripCamelCaseArgs(message: string) {
  return message.replace(/Unknown arguments?: (.+)/, (_, args: string) => {
    const kebabOnly = args.split(", ").filter(arg => arg.includes("-"));
    const label = kebabOnly.length === 1 ? "Unknown argument" : "Unknown arguments";
    return `${label}: ${kebabOnly.map(arg => `--${arg}`).join(", ")}`;
  });
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
        ...envModeCliOnlyOptions
      });
      for (const name in envModeCliOnlyOptions) {
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
      applyStoreGroups(builder);
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
  if (!argv.help) {
    return;
  }
  if (argv._[0] === "env") {
    const tables = storeRegistry
      .map(store => buildHelpTableData(store.name, store.schema, "env", undefined, store.dynamicFields, store.cliOverridableFields))
      .filter(table => table !== null);
    await renderHelpTables(tables);
  }
  process.exit(0);
}

await init();
