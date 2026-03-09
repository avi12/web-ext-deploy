import { z } from "zod";
export declare const ChromeTokenOptionsSchema: z.ZodObject<{
    clientId: z.ZodString;
    clientSecret: z.ZodString;
    printOnly: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export declare function runChromeToken(clientId: string, clientSecret: string, printOnly?: boolean): Promise<void>;
//# sourceMappingURL=chrome-token.d.ts.map