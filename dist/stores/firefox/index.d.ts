import { StoreName } from "../../types.js";
export declare const firefox: import("../../types.js").StoreDefinition<StoreName.Firefox, import("zod").ZodObject<{
    extId: import("zod").ZodString;
    jwtIssuer: import("zod").ZodString;
    jwtSecret: import("zod").ZodString;
    zip: import("zod").ZodPipe<import("zod").ZodString, import("zod").ZodTransform<string, string>>;
    zipSource: import("zod").ZodPipe<import("zod").ZodOptional<import("zod").ZodString>, import("zod").ZodTransform<string, string>>;
    changelog: import("zod").ZodPipe<import("zod").ZodOptional<import("zod").ZodString>, import("zod").ZodTransform<string, string>>;
    changelogLang: import("zod").ZodDefault<import("zod").ZodString>;
    devChangelog: import("zod").ZodPipe<import("zod").ZodOptional<import("zod").ZodString>, import("zod").ZodTransform<string, string>>;
}, import("zod/v4/core").$strip>, readonly string[]>;
//# sourceMappingURL=index.d.ts.map