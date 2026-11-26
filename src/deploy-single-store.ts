import { z } from "zod";

import { storeRegistry } from "./stores/registry.js";
import { type DeployContext, StoreStatus } from "./types.js";
import { buildHelpTableData, type HelpTableData } from "./ui/ink-logger.js";
import { red } from "./ui/logging.js";
import { isString } from "./utils/guards.js";
import { createGuard } from "./utils/zod-guard.js";

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

export const isStoreValidationError = createGuard(z.instanceof(StoreValidationError));

export function deployStore({
  options,
  storeName,
  context
}: {
  options: unknown;
  storeName: string;
  context?: DeployContext & {
    isDryRun?: boolean;
    mode?: "cli" | "env";
  };
}) {
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
      const failedFields = [...new Set(structuralIssues.map(issue => issue.path[0]).filter(isString))];
      const missingFields = failedFields.length > 0 ? failedFields : undefined;
      const helpTableData = buildHelpTableData({
        storeName: store.name,
        schema: store.schema,
        mode: context?.mode,
        missingFields,
        dynamicFields: store.dynamicFields,
        cliOverridableFields: store.cliOverridableFields
      });
      throw new StoreValidationError(messages.join("\n"), helpTableData ? [helpTableData] : [], error);
    }

    throw new Error(messages.join("\n"), { cause: error });
  }

  const prepared = parseResult.data;
  if (context?.isDryRun) {
    context.logger?.info("Dry run: validation passed");
    context.setStatus?.(StoreStatus.SUCCESS);
    return Promise.resolve(true);
  }

  return store.deploy({
    options: prepared,
    context
  });
}
