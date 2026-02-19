import yargs, { type Options } from "yargs";
import { z } from "zod";
import { capitalCase, kebabCase } from "./case-conversion.js";
import { config } from "./dotenv.js";
import { getSignInCookie } from "./get-sign-in-cookie.js";
import { renderStoreHelp } from "./ink-logger.js";
import { red } from "./logging.js";
import { storeRegistry, storeNames, isSupportedStore, getStore } from "./stores/registry.js";
import { isObjectEmpty, mapStoreArgs } from "./utils.js";

const BaseOptionsSchema = z.object({
  publishOnly: z.array(z.string()).optional().describe("Only publish to specific stores"),
  getCookies: z.array(z.string()).optional().describe("Get cookies for specific stores"),
  autoFetchCookies: z.boolean().optional().describe("Automatically fetch cookies for stores that support it"),
  dryRun: z.boolean().optional().describe("Validate inputs without deploying"),
  verbose: z.boolean().optional().describe("Log each deployment step")
});

function schemaToOptions(store: string | "base", schema: z.ZodTypeAny) {
  const options: Record<string, Options> = {};
  if (!(schema instanceof z.ZodObject)) {
    return options;
  }

  const shape = schema.shape;

  for (const [key, value] of Object.entries(shape)) {
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
const storeOptionGroups: Record<string, string[]> = {};
for (const store of storeRegistry) {
  const options = schemaToOptions(store.name, store.schema);
  Object.assign(allStoreOptions, options);
  storeOptionGroups[store.name] = Object.keys(options);
}

const baseOptions = schemaToOptions("base", BaseOptionsSchema);
const { getCookies: getCookiesOption, ...otherBaseOptions } = baseOptions;

const EPILOGUE =
  "Choose which stores to deploy to by supplying their options.\n" +
  "Only stores with at least one argument will be included.\n" +
  "For each included store, all [required] options must be provided.";

function applyStoreGroups(y: ReturnType<typeof yargs>) {
  for (const [store, keys] of Object.entries(storeOptionGroups)) {
    y = y.group(keys, `${capitalCase(store)} Store:`);
  }
  return y;
}

export const parser = yargs(process.argv.slice(2))
  .scriptName("web-ext-deploy")
  .usage("$0 <command> [options]")
  .wrap(process.stdout.columns)
  .command("env", "Read from .env files", y => {
    return y
      .options({
        ...otherBaseOptions,
        getCookies: getCookiesOption
      })
      .epilogue(EPILOGUE);
  })
  .command("cli", "Pass arguments directly", y => {
    let builder = y.options({
      ...otherBaseOptions,
      ...allStoreOptions
    });
    builder = applyStoreGroups(builder);
    return builder.epilogue(EPILOGUE);
  })
  .demandCommand(1, "You need at least one command before moving on")
  .strict()
  .help();

export const argv = parser.parseSync();

type StoreConfig = Record<string, unknown>;
type StoreConfigMap = Partial<Record<string, StoreConfig>>;

function getJsons(command: string) {
  if (command === "env") {
    const publishOnly = z.array(z.string()).optional().parse(argv.publishOnly);
    const stores = (publishOnly && publishOnly.length > 0 ? publishOnly : storeNames).filter(isSupportedStore);
    return stores.reduce((storesAcc: StoreConfigMap, store: string) => {
      const { parsed = {} } = config({ path: `${store}.env` });
      if (!isObjectEmpty(parsed)) {
        const cliOverrides = getJsonsFromArgs(store);
        storesAcc[store] = { ...parsed,
          ...cliOverrides };
      }
      return storesAcc;
    }, {});
  }

  return storeNames.reduce((storesAcc: StoreConfigMap, store: string) => {
    const jsonStore = getJsonsFromArgs(store);
    if (!isObjectEmpty(jsonStore)) {
      storesAcc[store] = jsonStore;
    }
    return storesAcc;
  }, {});
}

export { mapStoreArgs };

function getJsonsFromArgs(store: string): StoreConfig {
  return mapStoreArgs(argv as Record<string, unknown>, store);
}

export type CliLog = (level: "info" | "error", store: string, message: string) => void;

async function fetchMissingCookies(jsonStoresRaw: StoreConfigMap, log?: CliLog) {
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

    log?.("info", capitalCase(store.name), "Fetching cookies...");
    try {
      await getCookies([store.name]);
    } catch (e) {
      throw new Error(red(`Failed to fetch cookies: ${e}`), { cause: e });
    }

    const freshCookies = readCookiesFromEnv(store.name, fields);
    for (const field of fields) {
      if (!storeConfig[field] && freshCookies[field]) {
        storeConfig[field] = freshCookies[field];
      }
    }
  }
}

function collectMissingArgs(jsonStoresRaw: StoreConfigMap, autoFetchCookies?: boolean) {
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
    if (autoFetchCookies && cookieFields.length > 0) {
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

export async function getJsonStoresFromCli(log?: CliLog) {
  const command = z.string().parse(argv._[0]);
  const jsonStoresRaw = getJsons(command);

  if (isObjectEmpty(jsonStoresRaw)) {
    throw new Error(red("Supply arguments for at least one store."));
  }

  log?.("info", "System", `Using ${command} mode`);

  const autoFetchCookies = z.boolean().optional().parse(argv.autoFetchCookies);
  if (autoFetchCookies) {
    await fetchMissingCookies(jsonStoresRaw, log);
  }

  const missingArgs = collectMissingArgs(jsonStoresRaw, autoFetchCookies);

  if (Object.keys(missingArgs).length > 0) {
    const isCliMode = command === "cli";
    let errorContent = red("Missing required arguments:\n");
    for (const storeName of Object.keys(missingArgs)) {
      const store = getStore(storeName);
      if (store) {
        errorContent += renderStoreHelp(storeName, store.schema, isCliMode ? "cli" : "env");
      }
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
