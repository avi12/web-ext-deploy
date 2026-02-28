#!/usr/bin/env node
import { getSignInCookie } from "./stores/get-sign-in-cookie.js";
import { getStore, isSupportedStore, storeNames, storeRegistry } from "./stores/registry.js";
import { getStoreDisplayName } from "./stores/registry.js";
import {
  buildGlobalHelpTableData,
  buildHelpTableData,
  MissingArgsError,
  NoStoresError,
  renderApplicationError,
  renderHelpTables
} from "./ui/ink-logger.js";
import { camelCase, kebabCase } from "./utils/case-conversion.js";
import { config } from "./utils/dotenv.js";
import { isObjectEmpty, mapStoreArgs } from "./utils/helpers.js";
import { toError } from "./utils/retry.js";
import { getZodBaseType, getZodDescription, isZodOptional, unwrapZod } from "./utils/zod.js";
import yargs, { type Arguments, type Options } from "yargs";
import { z } from "zod";

const BaseOptionsSchema = z.object({
  autoFetchCookies: z.boolean().optional().default(false).describe("Automatically fetch cookies as needed for stores that require them"),
  dryRun: z.boolean().optional().default(false).describe("Validate inputs without deploying"),
  verbose: z.boolean().optional().default(false).describe("Log each deployment step")
});

const publishOnlyDescription = `Only publish to specific stores: ${storeNames.join(", ")}`;

const EnvOptionsSchema = z.object({
  publishOnly: z.array(z.string()).optional().describe(publishOnlyDescription),
  ...BaseOptionsSchema.shape
});

function schemaToOptions(store: string | "base", schema: z.ZodTypeAny) {
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
    options[optionName] = { type, description: !isOptional && store !== "base" ? `${description} [required]`.trim() : description };
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

const CLI_EPILOGUE =
  "Choose which stores to deploy to by supplying their options\n" +
  "Only stores with at least one argument will be included\n" +
  "For each included store, all [required] options must be provided";

const ENV_EPILOGUE =
  "Create a .env file for each store you want to deploy to (e.g. chrome.env, firefox.env)\n" +
  "Required fields go in the .env file; dynamic fields are passed as CLI arguments";

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
      return builder.version(false).epilogue(ENV_EPILOGUE);
    },
    handleDeploy
  )
  .command(
    "cli",
    "Pass arguments directly",
    builder => {
      builder = builder.options({ ...baseOptions, ...allStoreOptions });
      builder = applyStoreGroups(builder);
      return builder.version(false).epilogue(CLI_EPILOGUE);
    },
    handleDeploy
  )
  .command(
    "chrome-token",
    "Get a Chrome Web Store refresh token",
    builder => builder.version(false).options({
      "client-id": { type: "string", description: "OAuth client ID", demandOption: true },
      "client-secret": { type: "string", description: "OAuth client secret", demandOption: true },
      "print-only": { type: "boolean", description: "Print token to terminal instead of saving to chrome.env" }
    }),
    async argv => {
      const { runChromeToken } = await import("./stores/chrome/chrome-token.js");
      await runChromeToken(argv.clientId, argv.clientSecret, argv.printOnly);
    }
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

async function handleDeploy(argv: Arguments) {
  const { runDeploy } = await import("./deploy-all-stores.js");
  try {
    await runDeploy(argv);
  } catch (error) {
    await renderApplicationError(toError(error));
    process.exit(1);
  }
}

type StoreConfig = Record<string, unknown>;
type StoreConfigMap = Partial<Record<string, StoreConfig>>;

function getJsons(command: string, argv: Arguments) {
  if (command === "env") {
    const publishOnly = z.array(z.string()).safeParse(argv.publishOnly).data;
    const stores = (publishOnly && publishOnly.length > 0 ? publishOnly : storeNames).filter(isSupportedStore);
    const result: StoreConfigMap = {};
    for (const store of stores) {
      const { parsed: rawParsed = {} } = config({ path: `${store}.env` });
      if (isObjectEmpty(rawParsed)) {
        continue;
      }
      const parsed = Object.fromEntries(
        Object.entries(rawParsed).map(([key, value]) => [camelCase(key.toLowerCase()), value])
      );
      const storeConfig = getStore(store);
      const dynamicFields = storeConfig?.dynamicFields ?? [];
      const cliOverridableFields = new Set([...dynamicFields, ...(storeConfig?.cliOverridableFields ?? [])]);
      const envValues = dynamicFields.length
        ? Object.fromEntries(Object.entries(parsed).filter(([key]) => !dynamicFields.includes(key)))
        : parsed;
      const cliOverrides = getJsonsFromArgs(store, argv);
      const allowedOverrides = Object.fromEntries(
        Object.entries(cliOverrides).filter(([key]) => cliOverridableFields.has(key))
      );
      result[store] = { ...envValues, ...allowedOverrides };
    }
    return result;
  }

  const result: StoreConfigMap = {};
  for (const store of storeNames) {
    const jsonStore = getJsonsFromArgs(store, argv);
    if (!isObjectEmpty(jsonStore)) {
      result[store] = jsonStore;
    }
  }
  return result;
}

export { mapStoreArgs };

function getJsonsFromArgs(store: string, argv: Arguments) {
  return mapStoreArgs(Object.fromEntries(Object.entries(argv)), store);
}

async function fetchMissingCookies(jsonStoresRaw: StoreConfigMap, log?: (message: string) => void) {
  for (const store of storeRegistry) {
    const fields = store.cookieFields;
    if (!fields || fields.length === 0) {
      continue;
    }

    const storeConfig = jsonStoresRaw[store.name];
    if (!storeConfig) {
      continue;
    }

    const envCookies = readCookiesFromEnv(store.name, fields);
    for (const field of fields) {
      if (!storeConfig[field] && envCookies[field]) {
        storeConfig[field] = envCookies[field];
      }
    }

    const missingFields = fields.filter(field => !storeConfig[field]);
    if (missingFields.length === 0) {
      continue;
    }

    log?.(`${getStoreDisplayName(store.name)}: Fetching cookies...`);
    try {
      await getCookies([store.name]);
    } catch (error) {
      throw new Error(`Failed to fetch cookies: ${error}`, { cause: error });
    }

    const freshCookies = readCookiesFromEnv(store.name, fields);
    for (const field of fields) {
      if (!storeConfig[field] && freshCookies[field]) {
        storeConfig[field] = freshCookies[field];
      }
    }
  }
}

function collectMissingArgs(jsonStoresRaw: StoreConfigMap, isAutoFetchCookies?: boolean) {
  const missingArgs: Record<string, { required: string[]; optional?: string[] }> = {};

  for (const store of storeRegistry) {
    const storeConfig = jsonStoresRaw[store.name];
    if (!storeConfig) {
      continue;
    }
    if (!(store.schema instanceof z.ZodObject)) {
      continue;
    }

    const requiredFields: string[] = [];
    const optionalFields: string[] = [];
    for (const [key, value] of Object.entries(store.schema.shape)) {
      if (isZodOptional(value)) {
        optionalFields.push(key);
      } else {
        requiredFields.push(key);
      }
    }

    const missingRequired = requiredFields.filter(field => !storeConfig[field]);

    const cookieFields = store.cookieFields || [];
    if (isAutoFetchCookies && cookieFields.length > 0) {
      const missingCookieFields = cookieFields.filter(field => !storeConfig[field]);
      if (missingCookieFields.length === cookieFields.length) {
        continue;
      }
    } else {
      const missingCookieFields = cookieFields.filter(field => !storeConfig[field]);
      missingRequired.push(...missingCookieFields);
    }

    if (missingRequired.length === 0) {
      continue;
    }

    const missingOptional = optionalFields.filter(field => !storeConfig[field]);
    missingArgs[store.name] = {
      required: missingRequired,
      ...(missingOptional.length > 0 && { optional: missingOptional })
    };
  }

  return missingArgs;
}

function collectMissingGlobalArgs(argv: Arguments) {
  const globalSchema = BaseOptionsSchema.shape;
  const missingGlobal: string[] = [];

  for (const key in globalSchema) {
    if (argv[key] === undefined) {
      missingGlobal.push(key);
    }
  }

  return missingGlobal;
}

export async function getJsonStoresFromCli(argv: Arguments, log?: (message: string) => void) {
  const command = z.string().safeParse(argv._[0]).data ?? "";
  const jsonStoresRaw = getJsons(command, argv);

  if (isObjectEmpty(jsonStoresRaw)) {
    if (command === "env") {
      const hasCookieStores = storeRegistry.some(store => store.cookieFields && store.cookieFields.length > 0);
      const allGlobalKeys = ["publishOnly", ...(hasCookieStores ? ["autoFetchCookies"] : []), "dryRun", "verbose"];
      const tables = [
        ...storeRegistry
          .map(store => buildHelpTableData(store.name, store.schema, "env", undefined, store.dynamicFields, store.cliOverridableFields))
          .filter((data): data is NonNullable<typeof data> => data !== null),
        buildGlobalHelpTableData(EnvOptionsSchema, allGlobalKeys, "cli")
      ].filter((data): data is NonNullable<typeof data> => data !== null);
      throw new NoStoresError("No .env files found. In env mode, store credentials are read from .env files", tables);
    }
    throw new NoStoresError("Supply arguments for at least one store", []);
  }

  const isAutoFetchCookies = z.boolean().safeParse(argv.autoFetchCookies).data;
  if (isAutoFetchCookies) {
    await fetchMissingCookies(jsonStoresRaw, log);
  }

  const missingArgs = collectMissingArgs(jsonStoresRaw, isAutoFetchCookies);
  if (!isObjectEmpty(missingArgs)) {
    const isCliMode = command === "cli";
    const tables = [];
    for (const storeName in missingArgs) {
      const store = getStore(storeName);
      if (store) {
        const { required, optional = [] } = missingArgs[storeName];
        const allMissingFields = [...required, ...optional];
        const tableData = buildHelpTableData(storeName, store.schema, isCliMode ? "cli" : "env", allMissingFields, store.dynamicFields, store.cliOverridableFields);
        if (tableData) {
          tables.push(tableData);
        }
      }
    }
    const hasCookieStores = Object.keys(missingArgs).some(storeName => {
      const store = getStore(storeName);
      return store?.cookieFields && store.cookieFields.length > 0;
    });
    const missingGlobalArgs = collectMissingGlobalArgs(argv).filter(key => hasCookieStores || key !== "autoFetchCookies");
    const globalTableData = missingGlobalArgs.length > 0
      ? buildGlobalHelpTableData(isCliMode ? BaseOptionsSchema : EnvOptionsSchema, missingGlobalArgs, "cli")
      : null;
    if (globalTableData) {
      tables.push(globalTableData);
    }
    throw new MissingArgsError(tables);
  }

  return jsonStoresRaw;
}

export function getCookies(siteNames: Array<string>) {
  return getSignInCookie(siteNames);
}

export function readCookiesFromEnv(storeName: string, cookieFields: string[]) {
  const { parsed: rawParsed = {} } = config({ path: `${storeName}.env` });
  const parsed = Object.fromEntries(
    Object.entries(rawParsed).map(([key, value]) => [camelCase(key.toLowerCase()), value])
  );
  const result: Record<string, string> = {};
  for (const field of cookieFields) {
    if (parsed[field]) {
      result[field] = parsed[field];
    }
  }
  return result;
}

export function createCookieRefreshCallback(store: string, cookieFields: string[]) {
  return async () => {
    await getCookies([store]);
    return readCookiesFromEnv(store, cookieFields);
  };
}

const argv = await parser.parseAsync();
if (argv.help) {
  const command = z.string().safeParse(argv._[0]).data;
  if (command === "env") {
    const tables = storeRegistry
      .map(store => buildHelpTableData(store.name, store.schema, "env", undefined, store.dynamicFields, store.cliOverridableFields))
      .filter((table): table is NonNullable<typeof table> => table !== null);
    await renderHelpTables(tables);
  }
  process.exit(0);
}
