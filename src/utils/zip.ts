import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const ExtensionManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  default_locale: z.string().optional()
});

export function getFullPath(file: string) {
  return path.resolve(process.cwd(), file);
}

export function getIsFileExists(file: string) {
  const correctedFile = file.includes("{version}") ? getCorrectZip(file) : file;
  return fs.existsSync(getFullPath(correctedFile));
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

  const manifestEntry = entries.find(entry => entry.filename === "manifest.json" && "getData" in entry);
  if (!manifestEntry || !("getData" in manifestEntry)) {
    await reader.close();
    throw new Error("manifest.json not found in zip");
  }

  const manifestContent = await manifestEntry.getData(new TextWriter());
  await reader.close();

  if (!manifestContent) {
    throw new Error("manifest.json is empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestContent);
  } catch (error) {
    throw new Error(`Failed to parse manifest.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  const manifest = ExtensionManifestSchema.safeParse(parsed);
  if (!manifest.success) {
    throw new Error(`Invalid manifest.json: ${manifest.error.message}`);
  }

  return manifest.data;
}
