import type { StoreDefinition } from "../types.js";
import { chrome } from "./chrome/index.js";
import { edge } from "./edge/index.js";
import { firefox } from "./firefox/index.js";
import { opera } from "./opera/index.js";

// To add a new store: import it and add it to this array.
export const storeRegistry: StoreDefinition[] = [chrome, firefox, edge, opera];

export const storeNames = storeRegistry.map(s => s.name);

export function getStore(name: string) {
  return storeRegistry.find(s => s.name === name);
}

export function isSupportedStore(value: unknown): value is string {
  return typeof value === "string" && storeNames.includes(value);
}

export function isSupportedGetCookies(value: unknown) {
  return typeof value === "string" && storeRegistry.some(s => s.name === value && (s.cookieFields?.length ?? 0) > 0);
}
