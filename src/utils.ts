import { camelCase } from "./case-conversion.js";
import type { StoreLogger } from "./types.js";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

const ExtensionManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  default_locale: z.string().optional()
});

export function getFullPath (file: string) {
  return path.resolve(process.cwd(), file);
}

export function getIsFileExists (file: string) {
  const correctedFile = file.includes("{version}") ? getCorrectZip(file) : file;
  return fs.existsSync(getFullPath(correctedFile));
}

export function isObjectEmpty (object: object) {
  return Object.keys(object).length === 0;
}

export function getCorrectZip (zipName: string) {
  const packageJsonPath = getFullPath("package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return zipName;
  }

  const { version = "" } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return zipName.replace("{version}", version);
}

export async function getExtJson (zip: string) {
  const blob = new Blob([fs.readFileSync(zip)]);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();

  const manifestEntry = entries.find(entry => entry.filename === "manifest.json" && "getData" in entry);
  const manifestContent = manifestEntry && "getData" in manifestEntry
    ? await manifestEntry.getData(new TextWriter())
    : "";

  await reader.close();
  const manifest = ExtensionManifestSchema.safeParse(JSON.parse(manifestContent));
  if (!manifest.success) {
    throw new Error(`Invalid manifest.json: ${manifest.error.message}`);
  }
  return manifest.data;
}

export function createGitIgnoreIfNeeded (stores: Array<string>) {
  const filename = ".gitignore";
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, "*.env");
    return;
  }

  const gitIgnoreCurrent = fs.readFileSync(filename, "utf8");
  if (!gitIgnoreCurrent.includes(".env")) {
    fs.appendFileSync(filename, "*.env");
    return;
  }

  if (gitIgnoreCurrent.includes("*.env")) {
    return;
  }

  const storesToAppend = stores.filter(store => !gitIgnoreCurrent.includes(`${store}.env`));
  fs.appendFileSync(filename, storesToAppend.map(store => `${store}.env`).join("\n"));
}

export function mapStoreArgs (rawArgs: Record<string, unknown>, store: string) {
  const prefix = `${store}-`;
  return Object.fromEntries(
    Object.entries(rawArgs)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]): [string, unknown] => [camelCase(key.replace(prefix, "")), value])
  );
}

export function headersToEnv (headersTotal: Record<string, unknown>) {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header}="${value}"`)
    .join("\n");
}

function getBackoffDelayMs (attempt: number) {
  return Math.min(2 ** attempt, 5) * 1000;
}

export function toError (value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}

export class CookieAuthError extends Error {
  constructor (store: string) {
    super(`${store}: Authentication failed — cookies may be expired`);
    this.name = "CookieAuthError";
  }
}

export type HttpLikeResponse = {
  data: unknown;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
};

export async function requestWithRetry<T> ({
  sendRequest,
  parseResponse,
  formatError,
  errorContext,
  logger,
  onRateLimit
}: {
  sendRequest: () => Promise<HttpLikeResponse>;
  parseResponse: (response: HttpLikeResponse) => T;
  formatError: (message: string) => string;
  errorContext: string;
  logger?: StoreLogger;
  onRateLimit?: (response: HttpLikeResponse) => Promise<void>;
}): Promise<T> {
  async function attempt (count: number): Promise<T> {
    const response = await sendRequest().catch((error: unknown): undefined => {
      if (error instanceof CookieAuthError) {
        throw error;
      }
      return undefined;
    });

    if (!response) {
      await setTimeout(getBackoffDelayMs(count));
      return attempt(count + 1);
    }

    if (response.status === 429) {
      if (onRateLimit) {
        await onRateLimit(response);
      } else {
        await setTimeout(getBackoffDelayMs(count));
      }
      return attempt(count + 1);
    }

    if (response.status >= 400 && response.status < 500) {
      const message = formatError(`${errorContext}: ${response.statusText}`);
      logger?.error(message);
      throw new Error(message);
    }

    if (response.status >= 500) {
      await setTimeout(getBackoffDelayMs(count));
      return attempt(count + 1);
    }

    return parseResponse(response);
  }

  return attempt(0);
}
