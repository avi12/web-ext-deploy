import { z } from "zod";
export declare function getZodBaseType(value: unknown): "string" | "number" | "array" | "boolean";
export declare function unwrapZod(value: unknown): unknown;
export declare function getZodDefaultValue(value: unknown): unknown;
export declare function getZodDescription(value: unknown): string;
type ZodObjectKeys<T extends z.ZodObject<z.ZodRawShape>> = T extends z.ZodObject<infer Shape> ? string & keyof Shape : never;
export declare function zodObjectEntries<T extends z.ZodObject<z.ZodRawShape>>(schema: T): [ZodObjectKeys<T>, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>][];
export declare function isZodOptional(value: unknown): boolean;
export {};
//# sourceMappingURL=zod.d.ts.map