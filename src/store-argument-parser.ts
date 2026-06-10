import {
  getStore,
  getStoreDisplayName,
  isSupportedStore,
  storeNames,
  storeRegistry
} from "./stores/registry.js";
import type { Arguments, StoreName } from "./types.js";
import { buildGlobalHelpTableData, buildHelpTableData, MissingArgsError, NoStoresError } from "./ui/ink-logger.js";
import { camelCase } from "./utils/case-conversion.js";
import { config } from "./utils/dotenv.js";
import { isObjectEmpty, mapStoreArgs } from "./utils/helpers.js";
import { isZodOptional, zodObjectEntries } from "./utils/zod.js";
import { z } from "zod";

export const BaseOptionsSchema = z.object({
  autoFetchCredentials: z.boolean().optional().default(false).describe("Automatically fetch credentials as needed (cookies, tokens) for stores that require them"),
  dryRun: z.boolean().optional().default(false).describe("Validate inputs without deploying"),
  verbose: z.boolean().optional().default(false).describe("Log each deployment step")
});

const publishOnlyDescription = `Only publish to specific stores: ${storeNames.join(", ")}`;

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

function readCredentialsFromEnv(storeName: StoreName, credentialFields: readonly string[]) {
  const { parsed: rawParsed = {} } = config({ path: `${storeName}.env` });
  const parsed = Object.fromEntries(
    Object.entries(rawParsed).map(([key, value]) => [camelCase(key.toLowerCase()), value])
  );
  const result: Record<string, string> = {};
  for (const field of credentialFields) {
    if (!parsed[field]) {
      continue;
    }

    result[field] = parsed[field];
  }
  return result;
}

async function fetchMissingCredentials(jsonStoresRaw: StoreConfigMap, log?: (message: string) => void, saveToEnv = true) {
  for (const store of storeRegistry) {
    const fields = store.credentialFields;
    const hasNoCredentialFields = !fields || fields.length === 0;
    if (hasNoCredentialFields) {
      continue;
    }

    const storeConfig = jsonStoresRaw[store.name];
    if (!storeConfig) {
      continue;
    }

    if (saveToEnv) {
      const envCredentials = readCredentialsFromEnv(store.name, fields);
      for (const field of fields) {
        const isAlreadySet = Boolean(storeConfig[field]);
        const hasEnvValue = Boolean(envCredentials[field]);
        if (isAlreadySet || !hasEnvValue) {
          continue;
        }

        storeConfig[field] = envCredentials[field];
      }
    }

    const missingFields = fields.filter(field => !storeConfig[field]);
    const hasNothingToFetch = missingFields.length === 0 || !store.fetchCredentials;
    if (hasNothingToFetch) {
      continue;
    }

    log?.(`${getStoreDisplayName(store.name)}: Fetching credentials...`);
    let fetchedCredentials: Record<string, string>;
    try {
      fetchedCredentials = await store.fetchCredentials(storeConfig, saveToEnv);
    } catch (error) {
      throw new Error(`Failed to fetch credentials: ${error}`, { cause: error });
    }

    for (const field of fields) {
      const isMissing = !storeConfig[field];
      const hasFetchedValue = Boolean(fetchedCredentials[field]);
      if (isMissing && hasFetchedValue) {
        storeConfig[field] = fetchedCredentials[field];
      }
    }
  }
}

function collectMissingArgs(jsonStoresRaw: StoreConfigMap, isAutoFetchCredentials?: boolean) {
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

    const credentialFields = store.credentialFields ?? [];
    const missingCredentialFields = credentialFields.filter(field => !storeConfig[field]);
    const missingManualCredentialFields = !isAutoFetchCredentials || credentialFields.length === 0 ? missingCredentialFields : [];
    const missingRequired = [
      ...requiredFields.filter(field => !storeConfig[field]),
      ...missingManualCredentialFields
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
  const hasCookieStores = storeRegistry.some(store => store.credentialFields && store.credentialFields.length > 0);
  const globalKeys = zodObjectEntries(EnvOptionsSchema)
    .map(([key]) => key)
    .filter(key => hasCookieStores || key !== "autoFetchCredentials");
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

  const isAutoFetchCredentials = z.boolean().safeParse(argv.autoFetchCredentials).data;
  const saveToEnv = command === "env";
  if (isAutoFetchCredentials) {
    await fetchMissingCredentials(jsonStoresRaw, log, saveToEnv);
  }

  const missingArgs = collectMissingArgs(jsonStoresRaw, isAutoFetchCredentials);
  if (isObjectEmpty(missingArgs)) {
    return jsonStoresRaw;
  }

  const isCliMode = command === "cli";
  const mode = isCliMode ? "cli" : "env";
  const hasCookieStores = storeRegistry.some(store => missingArgs[store.name] && store.credentialFields && store.credentialFields.length > 0);
  const missingGlobalArgs = collectMissingGlobalArgs(argv).filter(key => hasCookieStores || key !== "autoFetchCredentials");
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

export function createCredentialRefreshCallback(storeDef: { fetchCredentials?: (config: Record<string, unknown>, saveToEnv: boolean) => Promise<Record<string, string>> }, saveToEnv = true) {
  return () => storeDef.fetchCredentials?.({}, saveToEnv) ?? Promise.resolve({});
}
