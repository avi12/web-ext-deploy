import { z } from "zod";
import type { StoreDefinition } from "../types.js";
import { chrome } from "./chrome/index.js";
import { edge } from "./edge/index.js";
import { firefox } from "./firefox/index.js";
import { opera } from "./opera/index.js";

// To add a new store: import it and add it to this array.
export const storeRegistry: StoreDefinition[] = [chrome, firefox, edge, opera];

export const storeNames = ["chrome", "firefox", "edge", "opera"] as const;

export function getStore(name: string) {
  return storeRegistry.find(store => store.name === name);
}

export function isSupportedStore(value: unknown) {
  const result = z.string().safeParse(value);
  return result.success && storeNames.includes(result.data);
}
