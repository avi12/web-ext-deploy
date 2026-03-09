import { StoreName } from "../types.js";
import { chrome } from "./chrome/index.js";
import { edge } from "./edge/index.js";
import { firefox } from "./firefox/index.js";
import { opera } from "./opera/index.js";
import { z } from "zod";
// To add a new store: import it, add it to this array, and add its name to StoreName in types.ts.
export const storeRegistry = [chrome, firefox, edge, opera];
export const storeNames = storeRegistry.map(store => store.name);
const storeDisplayNames = {
    [StoreName.Chrome]: "Chrome Web Store",
    [StoreName.Firefox]: "Firefox Add-ons Store",
    [StoreName.Edge]: "Microsoft Partner Center",
    [StoreName.Opera]: "Opera Add-ons Store"
};
export function getStoreDisplayName(name) {
    return storeDisplayNames[name] ?? name;
}
export function getStore(name) {
    return storeRegistry.find(store => store.name === name);
}
export function isSupportedStore(value) {
    const result = z.string().safeParse(value);
    return result.success && storeNames.some(name => name === result.data);
}
