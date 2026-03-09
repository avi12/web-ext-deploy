import { z } from "zod";
export declare const FirefoxOptionsSubmissionApiSchema: z.ZodObject<{
    extId: z.ZodString;
    jwtIssuer: z.ZodString;
    jwtSecret: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    zipSource: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
    changelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
    changelogLang: z.ZodDefault<z.ZodString>;
    devChangelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>;
export type FirefoxOptionsSubmissionApi = z.infer<typeof FirefoxOptionsSubmissionApiSchema>;
//# sourceMappingURL=firefox-input.d.ts.map