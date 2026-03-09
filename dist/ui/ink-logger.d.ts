import { StoreStatus, type StoreName } from "../types.js";
import { z } from "zod";
type LogSource = StoreName | "System";
export type LogEntry = {
    store: LogSource;
    level: "info" | "warning" | "error";
    message: string;
    timestamp: Date;
};
export type HelpField = {
    name: string;
    type: string;
    isMissing?: boolean;
    defaultValue: string;
    description: string;
};
export type HelpTableData = {
    title: string;
    fields: HelpField[];
};
export declare class MissingArgsError extends Error {
    readonly tables: HelpTableData[];
    constructor(tables: HelpTableData[]);
}
export declare class NoStoresError extends Error {
    readonly tables: HelpTableData[];
    constructor(message: string, tables?: HelpTableData[]);
}
export declare function buildHelpTableData(storeName: StoreName, schema: z.ZodType, mode?: "cli" | "env", missingFields?: string[], dynamicFields?: string[], cliOverridableFields?: string[]): {
    title: string;
    fields: HelpField[];
};
export declare function buildGlobalHelpTableData(schema: z.ZodType, missingArgs: string[], mode?: "cli" | "env"): {
    title: string;
    fields: HelpField[];
};
export declare function createPreDeployUI(): {
    log(message: string): void;
    unmount(): void;
};
export declare function renderHelpTables(tables: HelpTableData[]): Promise<void>;
export declare function renderApplicationError(error: Error): Promise<void>;
export declare function getRecentActivityEntries(storeNames: StoreName[], entries: LogEntry[]): LogEntry[];
export declare function createInkLogger(storeNames: StoreName[], isDryRun?: boolean, isVerbose?: boolean): {
    ready: Promise<void>;
    logger: {
        info(store: LogSource, message: string): void;
        warning(store: LogSource, message: string): void;
        error(store: LogSource, message: string): void;
    };
    monitor: {
        updateStore(store: StoreName, status: StoreStatus, message?: string): void;
        setZipPath(store: StoreName, zipPath: string): void;
        setHelpTables(tables: HelpTableData[]): void;
    };
    forStore: (store: StoreName) => {
        info: (message: string) => void;
        warning: (message: string) => void;
        error: (message: string) => void;
        countdown(seconds: number, getMessage: (remaining: number) => string): Promise<void>;
    };
    waitForRender(): Promise<void>;
    unmount(): void;
};
export {};
//# sourceMappingURL=ink-logger.d.ts.map