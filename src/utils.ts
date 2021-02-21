import * as fs from "fs";
import * as path from "path";

export function getFullPath(file: string): string {
  return path.resolve(process.cwd(), file);
}

export function getIsFileExists(file: string): boolean {
  return fs.existsSync(getFullPath(file));
}

export function isObjectEmpty(object: object) {
  return Object.keys(object).length === 0;
}

export function getCorrectZip(zip: string) {
  const { version } = require(path.resolve(process.cwd(), "package.json"));
  return zip.replace("{version}", version);
}