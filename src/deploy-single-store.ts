import { storeRegistry } from "./stores/registry.js";
import { StoreStatus, type DeployContext } from "./types.js";
import { buildHelpTableData, type HelpTableData } from "./ui/ink-logger.js";
import { red } from "./ui/logging.js";

export class StoreValidationError extends Error {
  helpTables: HelpTableData[];
  constructor(message: string, helpTables: HelpTableData[], cause?: unknown) {
    super(message);
    this.name = "StoreValidationError";
    this.helpTables = helpTables;
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
    const { error } = parseResult;
    const messages = error.issues.map(issue => issue.message);
    const structuralIssues = error.issues.filter(issue => issue.code !== "custom");
    if (structuralIssues.length > 0) {
      const failedFields = [...new Set(
        structuralIssues
          .map(issue => issue.path[0])
          .filter(path => typeof path === "string")
      )];
      const missingFields = failedFields.length > 0 ? failedFields : undefined;
      const helpTableData = buildHelpTableData(store.name, store.schema, context?.mode, missingFields, store.dynamicFields, store.cliOverridableFields);
      throw new StoreValidationError(messages.join("\n"), helpTableData ? [helpTableData] : [], error);
    }
    throw new Error(messages.join("\n"), { cause: error });
  }
  const prepared = parseResult.data;
  if (context?.isDryRun) {
    context.logger?.info("Dry run: validation passed");
    context.setStatus?.(StoreStatus.Success);
    return Promise.resolve(true);
  }
  return store.deploy(prepared, context);
}
