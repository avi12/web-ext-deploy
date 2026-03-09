import { type DeployContext } from "./types.js";
import { type HelpTableData } from "./ui/ink-logger.js";
export declare class StoreValidationError extends Error {
    helpTables: HelpTableData[];
    constructor(message: string, helpTables: HelpTableData[], cause?: unknown);
}
export declare function deployStore(options: unknown, storeName: string, context?: DeployContext & {
    isDryRun?: boolean;
    mode?: "cli" | "env";
}): Promise<boolean>;
//# sourceMappingURL=deploy-single-store.d.ts.map