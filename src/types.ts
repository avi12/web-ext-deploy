export const Stores = ["chrome", "firefox", "edge", "opera"] as const;
export type SupportedStores = typeof Stores[number];
export type SupportedGetCookies = "firefox" | "opera";
