import { storeRegistry } from "./stores/registry.js";
import { StoreStatus, type DeployContext } from "./types.js";
import { renderStoreHelp } from "./ui/ink-logger.js";
import { red } from "./ui/logging.js";

export class StoreValidationError extends Error {
  help: string;
  constructor(message: string, help: string, cause?: unknown) {
    super(message);
    this.name = "StoreValidationError";
    this.help = help;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function deployStore(
  options: unknown,
  storeName: string,
  context?: DeployContext & { isDryRun?: boolean; mode?: "cli" | "env" }
) {
  const store = storeRegistry.find(store => store.name === storeName);
  if (!store) {
    throw new Error(red(`Unknown store: ${storeName}`));
  }
  const parseResult = store.schema.safeParse(options);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map(issue => issue.message);
    const failedFields = [...new Set(
      parseResult.error.issues
        .map(issue => issue.path[0])
        .filter((path): path is string => typeof path === "string")
    )];
    const help = renderStoreHelp(store.name, store.schema, context?.mode, failedFields.length > 0 ? failedFields : undefined, store.dynamicFields, store.cliOverridableFields);
    throw new StoreValidationError(messages.join("\n"), help, parseResult.error);
  }

  const prepared = store.prepare(parseResult.data);
  if (context?.isDryRun) {
    context.logger?.info("Dry run: validation passed");
    context.setStatus?.(StoreStatus.Success);
    return Promise.resolve(true);
  }
  return store.deploy(prepared, context);
}
