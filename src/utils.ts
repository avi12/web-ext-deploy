import { z } from "zod";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import { camelCase } from "./case-conversion.js";
import { red } from "./logging.js";
import fs from "node:fs";
import path from "node:path";

const ExtensionManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  default_locale: z.string().optional()
});

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

export function getFullPath(file: string) {
  return path.resolve(process.cwd(), file);
}

export function getIsFileExists(file: string) {
  const correctedFile = file.includes("{version}") ? getCorrectZip(file) : file;
  return fs.existsSync(getFullPath(correctedFile));
}

export function isObjectEmpty(object: object) {
  return Object.keys(object).length === 0;
}

export function getCorrectZip(zipName: string) {
  const packageJsonPath = getFullPath("package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return zipName;
  }

  const { version = "" } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  return zipName.replace("{version}", version);
}

export async function getExtJson(zip: string) {
  const blob = new Blob([fs.readFileSync(zip)]);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();

  let manifestContent = "";
  for (const entry of entries) {
    if (entry.filename === "manifest.json" && "getData" in entry) {
      manifestContent = await entry.getData(new TextWriter());
      break;
    }
  }

  await reader.close();
  const manifest = ExtensionManifestSchema.safeParse(JSON.parse(manifestContent));
  if (!manifest.success) {
    throw new Error(`Invalid manifest.json: ${manifest.error.message}`);
  }
  return manifest.data;
}


export function getErrorMessage({
  store,
  error = "",
  actionName
}: {
  store: string;
  zip?: string;
  error?: number | string;
  actionName: string;
}) {
  return red(`${store}: Failed to ${actionName}: ${error}`);
}

export function createGitIgnoreIfNeeded(stores: Array<string>) {
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

export function mapStoreArgs(rawArgs: Record<string, unknown>, store: string) {
  const prefix = `${store}-`;
  return Object.fromEntries(
    Object.entries(rawArgs)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]): [string, unknown] => [camelCase(key.replace(prefix, "")), value])
  );
}

export function headersToEnv(headersTotal: Record<string, unknown>) {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header}="${value}"`)
    .join("\n");
}

export class CookieAuthError extends Error {
  constructor(store: string) {
    super(`${store}: Authentication failed — cookies may be expired`);
    this.name = "CookieAuthError";
  }
}
