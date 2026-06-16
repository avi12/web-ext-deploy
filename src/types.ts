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

type CredentialRefreshCallback = () => Promise<Record<string, string>>;

export type DeployContext = {
  logger?: StoreLogger;
  onCredentialsExpired?: CredentialRefreshCallback;
  setStatus?: (status: StoreStatus, message?: string) => void;
  setExtensionName?: (name: string) => void;
};

export enum StoreName {
  Chrome = "chrome",
  Firefox = "firefox",
  Edge = "edge",
  Opera = "opera"
}

// Parsed CLI arguments. `_` holds positionals (`_[0]` is the command); every
// option is keyed by both its kebab-case and camelCase form, mirroring how the
// rest of the code reads store flags (kebab) and global flags (camelCase).
export type Arguments = {
  _: string[];
} & Record<string, unknown>;

export type StoreDefinition<
  Name extends StoreName = StoreName,
  Schema extends z.ZodTypeAny = z.ZodTypeAny,
  CredentialFields extends readonly string[] = readonly string[]
> = {
  name: Name;
  schema: Schema;
  deploy: (options: unknown, context?: DeployContext) => Promise<boolean>;
  credentialFields?: CredentialFields;
  fetchCredentials?: (config: Record<string, unknown>, saveToEnv: boolean) => Promise<Record<string, string>>;
  dynamicFields?: string[];
  cliOverridableFields?: string[];
};

export function defineStore<
  Schema extends z.ZodTypeAny,
  Name extends StoreName,
  CredentialFields extends readonly string[] = readonly string[]
>(config: {
  name: Name;
  schema: Schema;
  deploy: (options: z.infer<Schema>, context?: DeployContext) => Promise<boolean>;
  credentialFields?: CredentialFields;
  fetchCredentials?: (config: Record<string, unknown>, saveToEnv: boolean) => Promise<Record<string, string>>;
  dynamicFields?: string[];
  cliOverridableFields?: string[];
}): StoreDefinition<Name, Schema, CredentialFields> {
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
    credentialFields: config.credentialFields,
    fetchCredentials: config.fetchCredentials,
    dynamicFields: config.dynamicFields,
    cliOverridableFields: config.cliOverridableFields
  };
}
