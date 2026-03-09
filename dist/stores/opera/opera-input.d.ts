import { z } from "zod";
export declare const OperaOptionsSchema: z.ZodObject<{
    packageId: z.ZodCoercedNumber<unknown>;
    sessionid: z.ZodString;
    csrftoken: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    changelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>;
export type OperaOptions = z.infer<typeof OperaOptionsSchema>;
//# sourceMappingURL=opera-input.d.ts.map