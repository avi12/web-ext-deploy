import { StoreName } from "../../types.js";
export declare const chrome: import("../../types.js").StoreDefinition<StoreName.Chrome, import("zod").ZodObject<{
    extId: import("zod").ZodString;
    publisherId: import("zod").ZodString;
    clientId: import("zod").ZodString;
    clientSecret: import("zod").ZodString;
    refreshToken: import("zod").ZodString;
    zip: import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<string, string>>;
    skipReview: import("zod").ZodDefault<import("zod").ZodOptional<import("zod").ZodBoolean>>;
    deployPercentage: import("zod").ZodOptional<import("zod").ZodNumber>;
}, import("zod/v4/core").$strip>, readonly string[]>;
//# sourceMappingURL=index.d.ts.map