import { z } from "zod";
import type { StoreDefinition } from "../types.js";
import { chrome } from "./chrome/index.js";
import { edge } from "./edge/index.js";
import { firefox } from "./firefox/index.js";
import { opera } from "./opera/index.js";

// To add a new store: import it and add it to this array.
const stores = [chrome, firefox, edge, opera] as const;
export const storeRegistry: StoreDefinition[] = [...stores];

export type StoreName = (typeof stores)[number]["name"];
export const storeNames: StoreName[] = stores.map(store => store.name);

export function getStore(name: string) {
  return storeRegistry.find(store => store.name === name);
}

export function isSupportedStore(value: unknown): value is StoreName {
  const result = z.string().safeParse(value);
  return result.success && storeNames.some(name => name === result.data);
}
