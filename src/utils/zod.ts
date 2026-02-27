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
  if (value instanceof z.ZodPipe) {
    return unwrapZod(value.in);
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
  if (value instanceof z.ZodPipe) {
    return getZodDefaultValue(value.in);
  }
  return undefined;
}

export function getZodDescription(value: unknown): string {
  if (value instanceof z.ZodPipe) {
    return getZodDescription(value.in);
  }
  if (value instanceof z.ZodOptional || value instanceof z.ZodNullable || value instanceof z.ZodDefault) {
    return value.description || getZodDescription(value.unwrap());
  }
  if (value instanceof z.ZodType) {
    return value.description ?? "";
  }
  return "";
}

export function isZodOptional(value: unknown): boolean {
  if (value instanceof z.ZodOptional || value instanceof z.ZodNullable || value instanceof z.ZodDefault) {
    return true;
  }
  if (value instanceof z.ZodPipe) {
    return isZodOptional(value.in);
  }
  return false;
}
