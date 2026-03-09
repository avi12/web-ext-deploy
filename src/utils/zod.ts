import { z } from "zod";

export function getZodBaseType(value: unknown) {
  if (value instanceof z.ZodBoolean) {
    return "boolean";
  }
  if (value instanceof z.ZodNumber) {
    return "number";
  }
  if (value instanceof z.ZodArray) {
    return "array";
  }
  return "string";
}

export function unwrapZod(value: unknown) {
  let current = value;
  while (current instanceof z.ZodDefault || current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodPipe) {
    current = current instanceof z.ZodPipe ? current.in : current.unwrap();
  }
  return current;
}

export function getZodDefaultValue(value: unknown) {
  let current = value;
  while (true) {
    if (current instanceof z.ZodDefault) {
      return current.def.defaultValue;
    }
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodPipe) {
      current = current.in;
      continue;
    }
    return undefined;
  }
}

export function getZodDescription(value: unknown) {
  let current = value;
  while (true) {
    if (current instanceof z.ZodPipe) {
      current = current.in;
      continue;
    }
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault) {
      if (current.description) {
        return current.description;
      }
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodType) {
      return current.description ?? "";
    }
    return "";
  }
}

type ZodObjectKeys<T extends z.ZodObject<z.ZodRawShape>> =
  T extends z.ZodObject<infer Shape> ? string & keyof Shape : never;

export function zodObjectEntries<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return Object.entries(schema.shape).filter(
    (entry): entry is [ZodObjectKeys<T>, z.ZodTypeAny] => entry[0] in schema.shape
  );
}

export function isZodOptional(value: unknown) {
  if (value instanceof z.ZodOptional || value instanceof z.ZodNullable || value instanceof z.ZodDefault) {
    return true;
  }
  if (value instanceof z.ZodPipe) {
    return isZodOptional(value.in);
  }
  return false;
}
