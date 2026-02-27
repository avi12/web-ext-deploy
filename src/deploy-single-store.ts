import { storeRegistry } from "./stores/registry.js";
import { StoreStatus, type DeployContext } from "./types.js";
import { renderStoreHelp } from "./ui/ink-logger.js";
import { red } from "./ui/logging.js";
import { ZodError } from "zod";

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
  let prepared: unknown;
  try {
    prepared = store.prepare(options);
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.issues.map(issue => issue.message);
      const structuralIssues = error.issues.filter(issue => issue.code !== "custom");
      if (structuralIssues.length > 0) {
        const failedFields = [...new Set(
          structuralIssues
            .map(issue => issue.path[0])
            .filter((path): path is string => typeof path === "string")
        )];
        const help = renderStoreHelp(store.name, store.schema, context?.mode, failedFields.length > 0 ? failedFields : undefined, store.dynamicFields, store.cliOverridableFields);
        throw new StoreValidationError(messages.join("\n"), help, error);
      }
      throw new Error(messages.join("\n"));
    }
    throw error;
  }
  if (context?.isDryRun) {
    context.logger?.info("Dry run: validation passed");
    context.setStatus?.(StoreStatus.Success);
    return Promise.resolve(true);
  }
  return store.deploy(prepared, context);
}
