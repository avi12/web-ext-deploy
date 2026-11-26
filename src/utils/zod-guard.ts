import type { z } from "zod";

/** A type guard from a schema, for a value that is used as it is: a parsed copy would lose its identity and `this` */
export function createGuard<Schema extends z.ZodType>(schema: Schema) {
  return (value: unknown): value is z.infer<Schema> => schema.safeParse(value).success;
}
