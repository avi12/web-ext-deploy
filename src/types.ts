import { z } from "zod";

export type StoreLogger = {
  info: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
};

export type StoreOptionsBase = {
  zip?: string;
};

export type CookieRefreshCallback = () => Promise<Record<string, string>>;

export type StoreDefinition = {
  name: string;
  schema: z.ZodType;
  prepare: (options: unknown) => unknown;
  deploy: (
    options: unknown,
    logger?: StoreLogger,
    onCookieExpired?: CookieRefreshCallback,
    verbose?: boolean
  ) => Promise<boolean>;
  cookieFields?: string[];
  dynamicFields?: string[];
};

export function defineStore<T>(config: {
  name: string;
  schema: z.ZodType<T>;
  prepare: (options: T) => T;
  deploy: (options: T, logger?: StoreLogger, onCookieExpired?: CookieRefreshCallback, verbose?: boolean) => Promise<boolean>;
  cookieFields?: string[];
  dynamicFields?: string[];
}) {
  return {
    name: config.name,
    schema: config.schema,
    prepare: (options: unknown) => {
      const result = config.schema.safeParse(options);
      if (!result.success) {
        throw result.error;
      }
      return config.prepare(result.data);
    },
    deploy: (options: unknown, logger?: StoreLogger, onCookieExpired?: CookieRefreshCallback, verbose?: boolean) => {
      const result = config.schema.safeParse(options);
      if (!result.success) {
        throw result.error;
      }
      return config.deploy(result.data, logger, onCookieExpired, verbose);
    },
    cookieFields: config.cookieFields,
    dynamicFields: config.dynamicFields
  };
}
