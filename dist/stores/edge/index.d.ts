import { StoreName } from "../../types.js";
export declare const edge: import("../../types.js").StoreDefinition<StoreName.Edge, import("zod").ZodObject<{
    productId: import("zod").ZodString;
    clientId: import("zod").ZodString;
    apiKey: import("zod").ZodString;
    zip: import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<string, string>>;
    devChangelog: import("zod").ZodPipe<import("zod").ZodOptional<import("zod").ZodString>, import("zod").ZodTransform<string, string>>;
}, import("zod/v4/core").$strip>, readonly string[]>;
//# sourceMappingURL=index.d.ts.map