import { renderStoreHelp } from "./ink-logger.js";
import { red } from "./logging.js";
import { storeRegistry } from "./stores/registry.js";
import type { CookieRefreshCallback, StoreLogger } from "./types.js";

export function deployStore(
  options: unknown,
  storeName: string,
  logger?: StoreLogger,
  onCookieExpired?: CookieRefreshCallback,
  dryRun?: boolean,
  verbose?: boolean
) {
  const store = storeRegistry.find(store => store.name === storeName);
  if (!store) {
    throw new Error(red(`Unknown store: ${storeName}`));
  }
  const parseResult = store.schema.safeParse(options);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map(issue => issue.message);
    const help = renderStoreHelp(store.name, store.schema);
    throw new Error(messages.join("\n") + help, { cause: parseResult.error });
  }

  const prepared = store.prepare(parseResult.data);
  if (dryRun) {
    logger?.info("Dry run: validation passed");
    return Promise.resolve(true);
  }
  return store.deploy(prepared, logger, onCookieExpired, verbose);
}
