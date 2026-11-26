import { z } from "zod";

import { createGuard } from "./zod-guard.js";

export const isZodObject = createGuard(z.instanceof(z.ZodObject));
const isZodType = createGuard(z.instanceof(z.ZodType));
const isZodBoolean = createGuard(z.instanceof(z.ZodBoolean));
const isZodNumber = createGuard(z.instanceof(z.ZodNumber));
const isZodArray = createGuard(z.instanceof(z.ZodArray));
const isZodDefault = createGuard(z.instanceof(z.ZodDefault));
const isZodPipe = createGuard(z.instanceof(z.ZodPipe));
/** A wrapper that lets the value be left out */
const isZodOmittable = createGuard(
  z.union([z.instanceof(z.ZodDefault), z.instanceof(z.ZodOptional), z.instanceof(z.ZodNullable)])
);

export function getZodBaseType(value: unknown) {
  if (isZodBoolean(value)) {
    return "boolean";
  }

  if (isZodNumber(value)) {
    return "number";
  }

  if (isZodArray(value)) {
    return "array";
  }

  return "string";
}

export function unwrapZod(value: unknown) {
  let current = value;
  while (true) {
    if (isZodPipe(current)) {
      current = current.in;
      continue;
    }

    if (isZodOmittable(current)) {
      current = current.unwrap();
      continue;
    }

    return current;
  }
}

export function getZodDefaultValue(value: unknown) {
  let current = value;
  while (true) {
    if (isZodDefault(current)) {
      return current.def.defaultValue;
    }

    if (isZodOmittable(current)) {
      current = current.unwrap();
      continue;
    }

    if (isZodPipe(current)) {
      current = current.in;
      continue;
    }

    return undefined;
  }
}

export function getZodDescription(value: unknown) {
  let current = value;
  while (true) {
    if (isZodPipe(current)) {
      current = current.in;
      continue;
    }

    if (isZodOmittable(current)) {
      if (current.description) {
        return current.description;
      }

      current = current.unwrap();
      continue;
    }

    if (isZodType(current)) {
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
  if (isZodOmittable(value)) {
    return true;
  }

  if (isZodPipe(value)) {
    return isZodOptional(value.in);
  }

  return false;
}
