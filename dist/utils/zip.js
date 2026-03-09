import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
const ExtensionManifestSchema = z.object({
    name: z.string(),
    version: z.string(),
    default_locale: z.string().optional()
});
export function getFullPath(file) {
    return path.resolve(process.cwd(), file);
}
export function getIsFileExists(file) {
    const correctedFile = file.includes("{version}") ? getCorrectZip(file) : file;
    return fs.existsSync(getFullPath(correctedFile));
}
export function getCorrectZip(zipName) {
    const packageJsonPath = getFullPath("package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return zipName;
    }
    const { version = "" } = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return zipName.replace("{version}", version);
}
export async function getExtJson(zip) {
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
