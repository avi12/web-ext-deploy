import type { StoreName } from "../types.js";
import { camelCase } from "./case-conversion.js";
import fs from "node:fs";

export function isObjectEmpty(object: object) {
  return Object.keys(object).length === 0;
}

export function createGitIgnoreIfNeeded(stores: StoreName[]) {
  const filename = ".gitignore";
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, "*.env" + "\n");
    return;
  }

  const gitIgnoreCurrent = fs.readFileSync(filename, "utf8");
  const trailingNewline = gitIgnoreCurrent.endsWith("\n") ? "" : "\n";

  if (!gitIgnoreCurrent.includes(".env")) {
    fs.appendFileSync(filename, `${trailingNewline}*.env${"\n"}`);
    return;
  }

  if (gitIgnoreCurrent.includes("*.env")) {
    return;
  }

  const storesToAppend = stores.filter(store => !gitIgnoreCurrent.includes(`${store}.env`));
  if (storesToAppend.length > 0) {
    fs.appendFileSync(filename, `${trailingNewline}${storesToAppend.map(store => `${store}.env`).join("\n")}${"\n"}`);
  }
}

export function mapStoreArgs(rawArgs: Record<string, unknown>, store: string) {
  const prefix = `${store}-`;
  return Object.fromEntries(
    Object.entries(rawArgs)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [camelCase(key.replace(prefix, "")), value])
  );
}

export function headersToEnv(headersTotal: Record<string, unknown>) {
  return Object.entries(headersTotal)
    .map(([header, value]) => `${header.toUpperCase()}="${value}"`)
    .join("\n");
}
