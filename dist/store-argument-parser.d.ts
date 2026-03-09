import type { StoreName } from "./types.js";
import type { Arguments } from "yargs";
import { z } from "zod";
export declare const BaseOptionsSchema: z.ZodObject<{
    autoFetchCookies: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    verbose: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export declare const publishOnlyDescription: string;
export declare const EnvOptionsSchema: z.ZodObject<{
    autoFetchCookies: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    verbose: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    publishOnly: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
type StoreConfig = Record<string, unknown>;
export declare function readCookiesFromEnv(storeName: StoreName, cookieFields: readonly string[]): Record<string, string>;
export declare function getJsonStoresFromCli(argv: Arguments, log?: (message: string) => void): Promise<Partial<Record<StoreName, StoreConfig>>>;
export declare function createCookieRefreshCallback(store: StoreName, cookieFields: readonly string[]): () => Promise<Record<string, string>>;
export {};
//# sourceMappingURL=store-argument-parser.d.ts.map