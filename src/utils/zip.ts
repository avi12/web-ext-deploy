import { inflateSync } from "fflate";
import fs from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const ExtensionManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  default_locale: z.string().optional()
});

// ZIP record signatures and fixed header sizes (see APPNOTE.TXT).
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const CENTRAL_DIRECTORY_HEADER_SIZE = 46;
const LOCAL_FILE_HEADER_SIZE = 30;
const MAXIMUM_COMMENT_SIZE = 0xffff;

const COMPRESSION_STORED = 0;
const COMPRESSION_DEFLATE = 8;

interface CentralDirectoryEntry {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

// Issues a single targeted fs read for the given byte range, so the whole ZIP
// is never loaded — only the end-of-central-directory record, the central
// directory, and the bytes of the specific entry being extracted.
async function readRange(fileHandle: FileHandle, position: number, length: number) {
  const buffer = new Uint8Array(length);
  if (length === 0) {
    return buffer;
  }

  await fileHandle.read(buffer, 0, length, position);
  return buffer;
}

function toDataView(buffer: Uint8Array) {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

async function findCentralDirectoryLocation(fileHandle: FileHandle, fileSize: number) {
  const searchSize = Math.min(fileSize, END_OF_CENTRAL_DIRECTORY_SIZE + MAXIMUM_COMMENT_SIZE);
  const searchStart = fileSize - searchSize;
  const buffer = await readRange(fileHandle, searchStart, searchSize);
  const view = toDataView(buffer);

  for (let offset = searchSize - END_OF_CENTRAL_DIRECTORY_SIZE; offset >= 0; offset--) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }

    return {
      offset: view.getUint32(offset + 16, true),
      size: view.getUint32(offset + 12, true)
    };
  }

  throw new Error("End of central directory record not found in zip");
}

function findCentralDirectoryEntry(centralDirectory: Uint8Array, filename: string): CentralDirectoryEntry | undefined {
  const view = toDataView(centralDirectory);
  const decoder = new TextDecoder();

  let offset = 0;
  while (offset + CENTRAL_DIRECTORY_HEADER_SIZE <= centralDirectory.byteLength) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_HEADER_SIGNATURE) {
      throw new Error("Invalid central directory header in zip");
    }

    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + CENTRAL_DIRECTORY_HEADER_SIZE;
    const entryName = decoder.decode(centralDirectory.subarray(nameStart, nameStart + fileNameLength));
    if (entryName === filename) {
      return {
        compressionMethod: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        localHeaderOffset: view.getUint32(offset + 42, true)
      };
    }

    offset = nameStart + fileNameLength + extraFieldLength + commentLength;
  }

  return undefined;
}

async function readEntryData(fileHandle: FileHandle, entry: CentralDirectoryEntry) {
  const localHeader = await readRange(fileHandle, entry.localHeaderOffset, LOCAL_FILE_HEADER_SIZE);
  const view = toDataView(localHeader);
  if (view.getUint32(0, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Invalid local file header in zip");
  }

  // The local header's name and extra-field lengths can differ from the central
  // directory's, so the data offset must be derived from the local header.
  const fileNameLength = view.getUint16(26, true);
  const extraFieldLength = view.getUint16(28, true);
  const dataStart = entry.localHeaderOffset + LOCAL_FILE_HEADER_SIZE + fileNameLength + extraFieldLength;

  return readRange(fileHandle, dataStart, entry.compressedSize);
}

function decompressEntry(data: Uint8Array, compressionMethod: number) {
  if (compressionMethod === COMPRESSION_STORED) {
    return data;
  }

  if (compressionMethod === COMPRESSION_DEFLATE) {
    return inflateSync(data);
  }

  throw new Error(`Unsupported compression method ${compressionMethod} in zip`);
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
  const fileHandle = await open(zip, "r");

  try {
    const { size } = await fileHandle.stat();
    const location = await findCentralDirectoryLocation(fileHandle, size);
    const centralDirectory = await readRange(fileHandle, location.offset, location.size);

    const entry = findCentralDirectoryEntry(centralDirectory, "manifest.json");
    if (!entry) {
      throw new Error("manifest.json not found in zip");
    }

    const compressedData = await readEntryData(fileHandle, entry);
    const manifestContent = new TextDecoder().decode(decompressEntry(compressedData, entry.compressionMethod));
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
    await fileHandle.close();
  }
}
