import { StoreName } from "../../types.js";
export declare const opera: import("../../types.js").StoreDefinition<StoreName.Opera, import("zod").ZodObject<{
    packageId: import("zod").ZodCoercedNumber<unknown>;
    sessionid: import("zod").ZodString;
    csrftoken: import("zod").ZodString;
    zip: import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<string, string>>;
    changelog: import("zod").ZodPipe<import("zod").ZodOptional<import("zod").ZodString>, import("zod").ZodTransform<string, string>>;
}, import("zod/v4/core").$strip>, string[]>;
//# sourceMappingURL=index.d.ts.map