import yargs, { type Options } from "yargs";
import { z } from "zod";
import { capitalCase, kebabCase } from "./case-conversion.js";
import { config } from "./dotenv.js";
import { getSignInCookie } from "./get-sign-in-cookie.js";
import { renderGlobalArgsHelp, renderStoreHelp } from "./ink-logger.js";
import { red } from "./logging.js";
import { getStore, isSupportedStore, storeNames, storeRegistry } from "./stores/registry.js";
import { isObjectEmpty, mapStoreArgs } from "./utils.js";

const BaseOptionsSchema = z.object({
  autoFetchCookies: z.boolean().optional().describe("Automatically fetch cookies as needed for stores that require them"),
  dryRun: z.boolean().optional().describe("Validate inputs without deploying"),
  verbose: z.boolean().optional().describe("Log each deployment step")
});

function schemaToOptions(store: string | "base", schema: z.ZodTypeAny) {
  const options: Record<string, Options> = {};
  if (!(schema instanceof z.ZodObject)) {
    return options;
  }

  for (const [key, value] of Object.entries(schema.shape)) {
    const isPerStoreVerbose = key === "verbose" && store !== "base";
    if (isPerStoreVerbose) {
      continue;
    }
    const optionName = store === "base" ? kebabCase(key) : `${store}-${kebabCase(key)}`;
    let type: Options["type"] = "string";
    const isOptional =
      value instanceof z.ZodOptional || value instanceof z.ZodNullable || value instanceof z.ZodDefault;

    let valueType = value;
    if (value instanceof z.ZodOptional || value instanceof z.ZodNullable) {
      valueType = value.unwrap();
    }

    if (valueType instanceof z.ZodBoolean) {
      type = "boolean";
    } else if (valueType instanceof z.ZodNumber) {
      type = "number";
    } else if (valueType instanceof z.ZodArray) {
      type = "array";
    }

    const description = value.description || "";
    options[optionName] = {
      type,
      description: !isOptional && store !== "base" ? `${description} [required]`.trim() : description
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
  // In env mode, all store options are optional overrides (credentials come from .env files)
  const optionalOptions = Object.fromEntries(
    Object.entries(options).map(([key, opt]) => [
      key,
      { ...opt, description: (opt.description ?? "").replace(" [required]", "") }
    ])
  );
  Object.assign(envOverrideStoreOptions, optionalOptions);
  storeOptionGroups[store.name] = Object.keys(options);
}

const baseOptions = schemaToOptions("base", BaseOptionsSchema);
const otherBaseOptions = baseOptions;

const EPILOGUE =
  "Choose which stores to deploy to by supplying their options.\n" +
  "Only stores with at least one argument will be included.\n" +
  "For each included store, all [required] options must be provided.";

const envStoreHelp = storeRegistry.map(store => renderStoreHelp(store.name, store.schema, "env")).join("");

function applyStoreGroups(builder: ReturnType<typeof yargs>) {
  for (const [store, keys] of Object.entries(storeOptionGroups)) {
    builder = builder.group(keys, `${capitalCase(store)} Store:`);
  }
  return builder;
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
        ...otherBaseOptions,
        "publish-only": {
          type: "array" as const,
          description: "Only publish to specific stores"
        },
        ...envOverrideStoreOptions
      });
      builder = applyStoreGroups(builder);
      return builder.epilogue(EPILOGUE + envStoreHelp);
    },
    () => {}
  )
  .command(
    "cli",
    "Pass arguments directly",
    builder => {
      builder = builder.options({ ...otherBaseOptions, ...allStoreOptions });
      builder = applyStoreGroups(builder);
      return builder.epilogue(EPILOGUE);
    },
    () => {}
  )
  .demandCommand(1, "You need at least one command before moving on")
  .epilogue("Run 'web-ext-deploy env --help' or 'web-ext-deploy cli --help' for store-specific options.")
  .strict()
  .help();

type Argv = ReturnType<typeof parser.parseSync>;

type StoreConfig = Record<string, unknown>;
type StoreConfigMap = Partial<Record<string, StoreConfig>>;

function getJsons(command: string, argv: Argv) {
  if (command === "env") {
    const publishOnly = z.array(z.string()).safeParse(argv.publishOnly).data;
    const stores = (publishOnly && publishOnly.length > 0 ? publishOnly : storeNames).filter(isSupportedStore);
    return stores.reduce((storesAcc: StoreConfigMap, store: string) => {
      const { parsed = {} } = config({ path: `${store}.env` });
      if (!isObjectEmpty(parsed)) {
        const dynamicFields = getStore(store)?.dynamicFields ?? [];
        const envValues = dynamicFields.length
          ? Object.fromEntries(Object.entries(parsed).filter(([key]) => !dynamicFields.includes(key)))
          : parsed;
        const cliOverrides = getJsonsFromArgs(store, argv);
        storesAcc[store] = { ...envValues, ...cliOverrides };
      }
      return storesAcc;
    }, {});
  }

  return storeNames.reduce((storesAcc: StoreConfigMap, store: string) => {
    const jsonStore = getJsonsFromArgs(store, argv);
    if (!isObjectEmpty(jsonStore)) {
      storesAcc[store] = jsonStore;
    }
    return storesAcc;
  }, {});
}

export { mapStoreArgs };

function getJsonsFromArgs(store: string, argv: Argv) {
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

    log?.(`${capitalCase(store.name)}: Fetching cookies...`);
    try {
      await getCookies([store.name]);
    } catch(error) {
      throw new Error(red(`Failed to fetch cookies: ${error}`), { cause: error });
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
      if (value instanceof z.ZodOptional || value instanceof z.ZodNullable || value instanceof z.ZodDefault) {
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

function collectMissingGlobalArgs(argv: Argv) {
  const globalSchema = BaseOptionsSchema.shape;
  const missingGlobal: string[] = [];

  for (const key in globalSchema) {
    const argValue = argv[key];

    if (!z.coerce.string().nonempty().safeParse(argValue).success) {
      missingGlobal.push(key);
    }
  }

  return missingGlobal;
}

export async function getJsonStoresFromCli(argv: Argv, log?: (message: string) => void) {
  const command = z.string().safeParse(argv._[0]).data ?? "";
  const jsonStoresRaw = getJsons(command, argv);

  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(red("Supply arguments for at least one store."));
  }

  const isAutoFetchCookies = z.boolean().safeParse(argv.autoFetchCookies).data;
  if (isAutoFetchCookies) {
    await fetchMissingCookies(jsonStoresRaw, log);
  }

  const missingArgs = collectMissingArgs(jsonStoresRaw, isAutoFetchCookies);
  if (Object.keys(missingArgs).length > 0) {
    const isCliMode = command === "cli";
    let errorContent = red("Missing required arguments:\n");
    for (const storeName in missingArgs) {
      const store = getStore(storeName);
      if (store) {
        errorContent += renderStoreHelp(storeName, store.schema, isCliMode ? "cli" : "env");
      }
    }
    const missingGlobalArgs = collectMissingGlobalArgs(argv);
    if (missingGlobalArgs.length > 0) {
      errorContent += renderGlobalArgsHelp(missingGlobalArgs, isCliMode ? "cli" : "env");
    }
    throw new Error(errorContent);
  }

  return jsonStoresRaw;
}

export type { StoreConfigMap };

export async function getCookies(siteNames: Array<string>) {
  return getSignInCookie(siteNames);
}

export function readCookiesFromEnv(storeName: string, cookieFields: string[]) {
  const { parsed = {} } = config({ path: `${storeName}.env` });
  const result: Record<string, string> = {};
  for (const field of cookieFields) {
    if (parsed[field]) {
      result[field] = parsed[field];
    }
  }
  return result;
}

export function createCookieRefreshCallback(store: string, cookieFields: string[]) {
  return async() => {
    await getCookies([store]);
    return readCookiesFromEnv(store, cookieFields);
  };
}
