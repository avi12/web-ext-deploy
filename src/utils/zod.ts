import { z } from "zod";

export function getZodBaseType(value: unknown): "boolean" | "number" | "array" | "string" {
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

export function unwrapZod(value: unknown): unknown {
  if (value instanceof z.ZodDefault || value instanceof z.ZodOptional || value instanceof z.ZodNullable) {
    return unwrapZod(value.unwrap());
  }
  return value;
}

export function getZodDefaultValue(value: unknown): unknown {
  if (value instanceof z.ZodDefault) {
    return value.def.defaultValue;
  }
  if (value instanceof z.ZodOptional || value instanceof z.ZodNullable) {
    return getZodDefaultValue(value.unwrap());
  }
  return undefined;
}
