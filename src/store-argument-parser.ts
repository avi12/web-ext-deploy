import { getSignInCookie } from "./stores/get-sign-in-cookie.js";
import {
  getStore,
  getStoreDisplayName,
  isSupportedStore,
  storeNames,
  storeRegistry
} from "./stores/registry.js";
import type { StoreName } from "./types.js";
import { buildGlobalHelpTableData, buildHelpTableData, MissingArgsError, NoStoresError } from "./ui/ink-logger.js";
import { camelCase } from "./utils/case-conversion.js";
import { config } from "./utils/dotenv.js";
import { isObjectEmpty, mapStoreArgs } from "./utils/helpers.js";
import { isZodOptional, zodObjectEntries } from "./utils/zod.js";
import type { Arguments } from "yargs";
import { z } from "zod";

export const BaseOptionsSchema = z.object({
  autoFetchCookies: z.boolean().optional().default(false).describe("Automatically fetch cookies as needed for stores that require them"),
  dryRun: z.boolean().optional().default(false).describe("Validate inputs without deploying"),
  verbose: z.boolean().optional().default(false).describe("Log each deployment step")
});

export const publishOnlyDescription = `Only publish to specific stores: ${storeNames.join(", ")}`;

export const EnvOptionsSchema = z.object({
  publishOnly: z.array(z.string()).optional().describe(publishOnlyDescription),
  ...BaseOptionsSchema.shape
});

type StoreConfig = Record<string, unknown>;
type StoreConfigMap = Partial<Record<StoreName, StoreConfig>>;

function getJsonsFromArgs(store: StoreName, argv: Arguments) {
  return mapStoreArgs(Object.fromEntries(Object.entries(argv)), store);
}

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
        Object.entries(cliOverrides).filter(([key, value]) => cliOverridableFields.has(key) && value !== undefined)
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

export function readCookiesFromEnv(storeName: StoreName, cookieFields: readonly string[]) {
  const { parsed: rawParsed = {} } = config({ path: `${storeName}.env` });
  const parsed = Object.fromEntries(
    Object.entries(rawParsed).map(([key, value]) => [camelCase(key.toLowerCase()), value])
  );
  const result: Record<string, string> = {};
  for (const field of cookieFields) {
    if (!parsed[field]) {
      continue;
    }

    result[field] = parsed[field];
  }
  return result;
}

async function fetchMissingCookies(jsonStoresRaw: StoreConfigMap, log?: (message: string) => void, saveToEnv = true) {
  for (const store of storeRegistry) {
    const fields = store.cookieFields;
    if (!fields || fields.length === 0) {
      continue;
    }

    const storeConfig = jsonStoresRaw[store.name];
    if (!storeConfig) {
      continue;
    }

    if (saveToEnv) {
      const envCookies = readCookiesFromEnv(store.name, fields);
      for (const field of fields) {
        if (storeConfig[field] || !envCookies[field]) {
          continue;
        }

        storeConfig[field] = envCookies[field];
      }
    }

    const missingFields = fields.filter(field => !storeConfig[field]);
    if (missingFields.length === 0) {
      continue;
    }

    log?.(`${getStoreDisplayName(store.name)}: Fetching cookies...`);
    let fetchedCookies: Partial<Record<StoreName, Record<string, string>>>;
    try {
      fetchedCookies = await getSignInCookie([store.name], { saveToEnv });
    } catch (error) {
      throw new Error(`Failed to fetch cookies: ${error}`, { cause: error });
    }

    const storeCookies = fetchedCookies[store.name] ?? {};
    for (const field of fields) {
      if (!storeConfig[field] && storeCookies[field]) {
        storeConfig[field] = storeCookies[field];
      }
    }
  }
}

function collectMissingArgs(jsonStoresRaw: StoreConfigMap, isAutoFetchCookies?: boolean) {
  const missingArgs: Partial<Record<StoreName, { required: string[]; optional?: string[] }>> = {};

  for (const store of storeRegistry) {
    const storeConfig = jsonStoresRaw[store.name];
    if (!storeConfig) {
      continue;
    }

    if (!(store.schema instanceof z.ZodObject)) {
      continue;
    }

    const allFields = zodObjectEntries(store.schema);
    const requiredFields = allFields.filter(([, value]) => !isZodOptional(value)).map(([key]) => key);
    const optionalFields = allFields.filter(([, value]) => isZodOptional(value)).map(([key]) => key);

    const cookieFields = store.cookieFields ?? [];
    const missingCookieFields = cookieFields.filter(field => !storeConfig[field]);
    if (isAutoFetchCookies && cookieFields.length > 0 && missingCookieFields.length === cookieFields.length) {
      continue;
    }

    const missingManualCookieFields = !isAutoFetchCookies || cookieFields.length === 0 ? missingCookieFields : [];
    const missingRequired = [
      ...requiredFields.filter(field => !storeConfig[field]),
      ...missingManualCookieFields
    ];
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

function buildEnvHelpTables() {
  const hasCookieStores = storeRegistry.some(store => store.cookieFields && store.cookieFields.length > 0);
  const globalKeys = zodObjectEntries(EnvOptionsSchema)
    .map(([key]) => key)
    .filter(key => hasCookieStores || key !== "autoFetchCookies");
  return [
    ...storeRegistry.map(store => buildHelpTableData(store.name, store.schema, "env", undefined, store.dynamicFields, store.cliOverridableFields)),
    buildGlobalHelpTableData(EnvOptionsSchema, globalKeys, "cli")
  ].flatMap(data => data ? [data] : []);
}

function collectMissingGlobalArgs(argv: Arguments) {
  return zodObjectEntries(BaseOptionsSchema)
    .filter(([key]) => argv[key] === undefined)
    .map(([key]) => key);
}

export async function getJsonStoresFromCli(argv: Arguments, log?: (message: string) => void) {
  const command = z.string().safeParse(argv._[0]).data ?? "";
  const jsonStoresRaw = getJsons(command, argv);
  if (isObjectEmpty(jsonStoresRaw)) {
    if (command === "env") {
      throw new NoStoresError("No .env files found. In env mode, store credentials are read from .env files", buildEnvHelpTables());
    }

    throw new NoStoresError("Supply arguments for at least one store", []);
  }

  const isAutoFetchCookies = z.boolean().safeParse(argv.autoFetchCookies).data;
  const saveToEnv = command === "env";
  if (isAutoFetchCookies) {
    await fetchMissingCookies(jsonStoresRaw, log, saveToEnv);
  }

  const missingArgs = collectMissingArgs(jsonStoresRaw, isAutoFetchCookies);
  if (isObjectEmpty(missingArgs)) {
    return jsonStoresRaw;
  }

  const isCliMode = command === "cli";
  const mode = isCliMode ? "cli" : "env";
  const hasCookieStores = storeRegistry.some(store => missingArgs[store.name] && store.cookieFields && store.cookieFields.length > 0);
  const missingGlobalArgs = collectMissingGlobalArgs(argv).filter(key => hasCookieStores || key !== "autoFetchCookies");
  const globalSchema = isCliMode ? BaseOptionsSchema : EnvOptionsSchema;
  const storeTables = storeRegistry.flatMap(store => {
    const missingEntry = missingArgs[store.name];
    if (!missingEntry) {
      return [];
    }

    const { required, optional = [] } = missingEntry;
    const tableData = buildHelpTableData(store.name, store.schema, mode, [...required, ...optional], store.dynamicFields, store.cliOverridableFields);
    return tableData ? [tableData] : [];
  });
  const globalTable = buildGlobalHelpTableData(globalSchema, missingGlobalArgs, "cli");
  const tables = globalTable ? [...storeTables, globalTable] : storeTables;
  throw new MissingArgsError(tables);
}

export function createCookieRefreshCallback(store: StoreName, cookieFields: readonly string[], saveToEnv = true) {
  return async () => {
    const fetchedCookies = await getSignInCookie([store], { saveToEnv });
    const storeCookies = fetchedCookies[store] ?? {};
    return Object.fromEntries(cookieFields.map(field => [field, storeCookies[field] ?? ""]));
  };
}
