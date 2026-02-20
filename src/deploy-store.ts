import type { DeployContext } from "./types.js";

import { renderStoreHelp } from "./ink-logger.js";
import { red } from "./logging.js";
import { storeRegistry } from "./stores/registry.js";

export function deployStore(
  options: unknown,
  storeName: string,
  context?: DeployContext & { isDryRun?: boolean }
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
  if (context?.isDryRun) {
    context.logger?.info("Dry run: validation passed");
    context.setStatus?.("success");
    return Promise.resolve(true);
  }
  return store.deploy(prepared, context);
}
