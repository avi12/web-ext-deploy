import { Reader, TextWriter, ZipReader } from "@zip.js/zip.js";
import fs from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ExtensionManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  default_locale: z.string().optional()
});

// Reader subclass that issues targeted fs.read() range calls via a FileHandle,
// so zip.js only reads the EOCD record, the central directory, and the bytes
// of the specific entry being extracted — never the full ZIP.
class FileHandleReader extends Reader<string> {
  private fileHandle?: FileHandle;

  constructor(private filePath: string) {
    super(filePath);
  }

  async init() {
    this.fileHandle = await open(this.filePath, "r");
    const stat = await this.fileHandle.stat();
    this.size = stat.size;
  }

  async readUint8Array(index: number, length: number) {
    const buffer = new Uint8Array(length);
    await this.fileHandle!.read(buffer, 0, length, index);
    return buffer;
  }

  async close() {
    await this.fileHandle?.close();
  }
}

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
  const fileReader = new FileHandleReader(zip);
  const zipReader = new ZipReader(fileReader);

  try {
    const entries = await zipReader.getEntries();
    const manifestEntry = entries.find(entry => entry.filename === "manifest.json" && "getData" in entry);
    if (!manifestEntry || !("getData" in manifestEntry)) {
      throw new Error("manifest.json not found in zip");
    }

    const manifestContent = await manifestEntry.getData(new TextWriter());
    if (!manifestContent) {
      throw new Error("manifest.json is empty");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestContent);
    } catch (error) {
      throw new Error(`Failed to parse manifest.json: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }

    const manifest = ExtensionManifestSchema.safeParse(parsed);
    if (!manifest.success) {
      throw new Error(`Invalid manifest.json: ${manifest.error.message}`);
    }

    return manifest.data;
  } finally {
    await zipReader.close();
    await fileReader.close();
  }
}
