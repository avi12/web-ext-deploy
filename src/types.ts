import { capitalCase } from "change-case";

export const Stores = ["chrome", "firefox", "edge", "opera"] as const;
export const StoresCapitalized = Stores.map(stores => capitalCase(stores));
export type SupportedStores = typeof Stores[number];
export type SupportedStoresCapitalized = typeof StoresCapitalized[number];
export type SupportedGetCookies = "opera";
