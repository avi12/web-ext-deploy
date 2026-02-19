import { z } from "zod";
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
  const store = storeRegistry.find(s => s.name === storeName);
  if (!store) {
    throw new Error(red(`Unknown store: ${storeName}`));
  }
  try {
    const validated = store.schema.parse(options);
    const prepared = store.prepare(validated);
    if (dryRun) {
      logger?.info("Dry run: validation passed");
      return Promise.resolve(true);
    }
    return store.deploy(prepared, logger, onCookieExpired, verbose);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(issue => issue.message);
      const help = renderStoreHelp(store.name, store.schema);
      throw new Error(messages.join("\n") + help, { cause: error });
    }
    throw error;
  }
}
