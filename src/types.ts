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

export type StoreDefinition = {
  name: StoreName;
  schema: z.ZodType;
  deploy: (options: unknown, context?: DeployContext) => Promise<boolean>;
  cookieFields?: string[];
  dynamicFields?: string[];
  cliOverridableFields?: string[];
};

export function defineStore<T, Name extends string>(config: {
  name: Name;
  schema: z.ZodType<T>;
  deploy: (options: T, context?: DeployContext) => Promise<boolean>;
  cookieFields?: string[];
  dynamicFields?: string[];
  cliOverridableFields?: string[];
}) {
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
