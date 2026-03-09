import { StoreName } from "../types.js";
import { z } from "zod";
export declare const storeRegistry: readonly [import("../types.js").StoreDefinition<StoreName.Chrome, z.ZodObject<{
    extId: z.ZodString;
    publisherId: z.ZodString;
    clientId: z.ZodString;
    clientSecret: z.ZodString;
    refreshToken: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    skipReview: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    deployPercentage: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, readonly string[]>, import("../types.js").StoreDefinition<StoreName.Firefox, z.ZodObject<{
    extId: z.ZodString;
    jwtIssuer: z.ZodString;
    jwtSecret: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    zipSource: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
    changelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
    changelogLang: z.ZodDefault<z.ZodString>;
    devChangelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>, readonly string[]>, import("../types.js").StoreDefinition<StoreName.Edge, z.ZodObject<{
    productId: z.ZodString;
    clientId: z.ZodString;
    apiKey: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    devChangelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>, readonly string[]>, import("../types.js").StoreDefinition<StoreName.Opera, z.ZodObject<{
    packageId: z.ZodCoercedNumber<unknown>;
    sessionid: z.ZodString;
    csrftoken: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    changelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>, string[]>];
export declare const storeNames: StoreName[];
export declare function getStoreDisplayName(name: StoreName): string;
export declare function getStore(name: StoreName): import("../types.js").StoreDefinition<StoreName.Chrome, z.ZodObject<{
    extId: z.ZodString;
    publisherId: z.ZodString;
    clientId: z.ZodString;
    clientSecret: z.ZodString;
    refreshToken: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    skipReview: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    deployPercentage: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, readonly string[]> | import("../types.js").StoreDefinition<StoreName.Edge, z.ZodObject<{
    productId: z.ZodString;
    clientId: z.ZodString;
    apiKey: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    devChangelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>, readonly string[]> | import("../types.js").StoreDefinition<StoreName.Firefox, z.ZodObject<{
    extId: z.ZodString;
    jwtIssuer: z.ZodString;
    jwtSecret: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    zipSource: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
    changelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
    changelogLang: z.ZodDefault<z.ZodString>;
    devChangelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>, readonly string[]> | import("../types.js").StoreDefinition<StoreName.Opera, z.ZodObject<{
    packageId: z.ZodCoercedNumber<unknown>;
    sessionid: z.ZodString;
    csrftoken: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    changelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>, string[]>;
export declare function isSupportedStore(value: unknown): value is StoreName;
//# sourceMappingURL=registry.d.ts.map