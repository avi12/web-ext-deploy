import { z } from "zod";
export declare enum StoreStatus {
    Pending = "pending",
    Running = "running",
    Success = "success",
    Error = "error"
}
export type StoreLogger = {
    info: (message: string) => void;
    warning: (message: string) => void;
    error: (message: string) => void;
    countdown?: (seconds: number, getMessage: (remaining: number) => string) => Promise<void>;
};
type CookieRefreshCallback = () => Promise<Record<string, string>>;
export type DeployContext = {
    logger?: StoreLogger;
    onCookieExpired?: CookieRefreshCallback;
    isVerbose?: boolean;
    setStatus?: (status: StoreStatus, message?: string) => void;
    setZipPath?: (zipPath: string) => void;
};
export declare enum StoreName {
    Chrome = "chrome",
    Firefox = "firefox",
    Edge = "edge",
    Opera = "opera"
}
export type StoreDefinition<Name extends StoreName = StoreName, Schema extends z.ZodTypeAny = z.ZodTypeAny, CookieFields extends readonly string[] = readonly string[]> = {
    name: Name;
    schema: Schema;
    deploy: (options: unknown, context?: DeployContext) => Promise<boolean>;
    cookieFields?: CookieFields;
    dynamicFields?: string[];
    cliOverridableFields?: string[];
};
export declare function defineStore<Schema extends z.ZodTypeAny, Name extends StoreName, CookieFields extends readonly string[] = readonly string[]>(config: {
    name: Name;
    schema: Schema;
    deploy: (options: z.infer<Schema>, context?: DeployContext) => Promise<boolean>;
    cookieFields?: CookieFields;
    dynamicFields?: string[];
    cliOverridableFields?: string[];
}): StoreDefinition<Name, Schema, CookieFields>;
export {};
//# sourceMappingURL=types.d.ts.map