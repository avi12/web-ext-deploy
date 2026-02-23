import type { StoreDefinition } from "../types.js";
import { chrome } from "./chrome/index.js";
import { edge } from "./edge/index.js";
import { firefox } from "./firefox/index.js";
import { opera } from "./opera/index.js";
import { z } from "zod";

// To add a new store: import it and add it to this array.
export const storeRegistry: StoreDefinition[] = [chrome, firefox, edge, opera];

export const storeNames = storeRegistry.map(store => store.name);

const storeDisplayNames: Record<string, string> = {
  chrome: "Chrome Web Store",
  firefox: "Firefox Add-ons Store",
  edge: "Microsoft Partner Center",
  opera: "Opera Add-ons Store"
};

export function getStoreDisplayName(name: string) {
  return storeDisplayNames[name] ?? name;
}

export function getStore(name: string) {
  return storeRegistry.find(store => store.name === name);
}

export function isSupportedStore(value: unknown) {
  const result = z.string().safeParse(value);
  return result.success && storeNames.some(name => name === result.data);
}
