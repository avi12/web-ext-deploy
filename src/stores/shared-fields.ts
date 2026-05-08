import { storeError } from "../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../utils/zip.js";
import { z } from "zod";

const ZIP_DEFAULT_DESCRIPTION = `Path to the ZIP file. Supports "{version}" which is retrieved from package.json`;

export function requiredZipField(description: string = ZIP_DEFAULT_DESCRIPTION) {
  return z.string().nonempty()
    .describe(description)
    .transform(getCorrectZip)
    .check(ctx => {
      if (!getIsFileExists(ctx.value)) {
        ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value)}`) });
      }
    });
}

export function optionalZipSourceField(description: string) {
  return z.string().optional()
    .describe(description)
    .transform(value => value ? getCorrectZip(value) : undefined)
    .check(ctx => {
      const isMissingFile = ctx.value !== undefined && !getIsFileExists(ctx.value);
      if (isMissingFile) {
        ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Source zip doesn't exist: ${getFullPath(ctx.value)}`) });
      }
    });
}

export function changelogField(description: string) {
  return z.string().optional()
    .describe(description)
    .transform(value => value?.trim().replaceAll("\\n", "\n"));
}
