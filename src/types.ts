import { z } from "zod";

export enum StoreStatus {
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

export enum StoreName {
  Chrome = "chrome",
  Firefox = "firefox",
  Edge = "edge",
  Opera = "opera"
}

export type StoreDefinition<
  Name extends StoreName = StoreName,
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
  CookieFields extends readonly string[] = readonly string[]
> = {
  name: Name;
  schema: Schema;
  deploy: (options: unknown, context?: DeployContext) => Promise<boolean>;
  cookieFields?: CookieFields;
  dynamicFields?: string[];
  cliOverridableFields?: string[];
};

export function defineStore<
  Schema extends z.ZodTypeAny,
  Name extends StoreName,
  CookieFields extends readonly string[] = readonly string[]
>(config: {
  name: Name;
  schema: Schema;
  deploy: (options: z.infer<Schema>, context?: DeployContext) => Promise<boolean>;
  cookieFields?: CookieFields;
  dynamicFields?: string[];
  cliOverridableFields?: string[];
}): StoreDefinition<Name, Schema, CookieFields> {
  return {
    name: config.name,
    schema: config.schema,
    deploy(options: unknown, context?: DeployContext) {
      const result = config.schema.safeParse(options);
      if (!result.success) {
        throw result.error;
      }

      return config.deploy(result.data, context);
    },
    cookieFields: config.cookieFields,
    dynamicFields: config.dynamicFields,
    cliOverridableFields: config.cliOverridableFields
  };
}
