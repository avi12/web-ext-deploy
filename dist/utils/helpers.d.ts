import type { StoreName } from "../types.js";
export declare function isObjectEmpty(object: object): boolean;
export declare function createGitIgnoreIfNeeded(stores: StoreName[]): void;
export declare function mapStoreArgs(rawArgs: Record<string, unknown>, store: string): {
    [k: string]: unknown;
};
export declare function headersToEnv(headersTotal: Record<string, unknown>): string;
//# sourceMappingURL=helpers.d.ts.map