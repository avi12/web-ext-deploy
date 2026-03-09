import { z } from "zod";
export declare const EdgeOptionsPublishApiSchema: z.ZodObject<{
    productId: z.ZodString;
    clientId: z.ZodString;
    apiKey: z.ZodString;
    zip: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    devChangelog: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string, string>>;
}, z.core.$strip>;
export type EdgeOptionsPublishApi = z.infer<typeof EdgeOptionsPublishApiSchema>;
//# sourceMappingURL=edge-input.d.ts.map