import { z } from "zod";
export declare const ChromeOptionsSchema: z.ZodObject<{
    extId: z.ZodString;
    publisherId: z.ZodString;
    clientId: z.ZodString;
    clientSecret: z.ZodString;
    refreshToken: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    skipReview: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    deployPercentage: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type ChromeOptions = z.infer<typeof ChromeOptionsSchema>;
//# sourceMappingURL=chrome-input.d.ts.map