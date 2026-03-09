import { camelCase } from "./case-conversion.js";
import fs from "node:fs";
export function isObjectEmpty(object) {
    return Object.keys(object).length === 0;
}
export function createGitIgnoreIfNeeded(stores) {
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
export function mapStoreArgs(rawArgs, store) {
    const prefix = `${store}-`;
    return Object.fromEntries(Object.entries(rawArgs)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [camelCase(key.replace(prefix, "")), value]));
}
export function headersToEnv(headersTotal) {
    return Object.entries(headersTotal)
        .map(([header, value]) => `${header.toUpperCase()}="${value}"`)
        .join("\n");
}
