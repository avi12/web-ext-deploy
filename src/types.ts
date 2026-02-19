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
};

export function defineStore<T>(config: {
  name: string;
  schema: z.ZodType<T>;
  prepare: (options: T) => T;
  deploy: (options: T, logger?: StoreLogger, onCookieExpired?: CookieRefreshCallback, verbose?: boolean) => Promise<boolean>;
  cookieFields?: string[];
}) {
  return {
    name: config.name,
    schema: config.schema,
    prepare: (options: unknown) => config.prepare(config.schema.parse(options)),
    deploy: (options: unknown, logger?: StoreLogger, onCookieExpired?: CookieRefreshCallback, verbose?: boolean) =>
      config.deploy(config.schema.parse(options), logger, onCookieExpired, verbose),
    cookieFields: config.cookieFields
  };
}
