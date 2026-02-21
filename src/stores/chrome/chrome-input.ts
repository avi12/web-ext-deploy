import { red } from "../../logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(`Chrome: ${message}`);
}

export const ChromeOptionsSchema = z
  .object({
    extId: z.string().nonempty(storeError("No extension ID is provided")).describe("Get it from https://chromewebstore.google.com/detail/EXT_ID"),
    publisherId: z.string().nonempty(storeError("No publisher ID is provided")).describe("Chrome Web Store publisher ID"),
    refreshToken: z.string().nonempty(storeError("No refresh token is provided")).describe("OAuth refresh token"),
    zip: z.string().nonempty(storeError("No zip is provided")).describe("Path to the ZIP file"),
    skipReview: z.boolean().optional().default(false).describe("Publish without waiting for a review"),
    deployPercentage: z.number().int().min(1).max(100).optional().describe("Staged rollout percentage (1–100) (default: 100)")
  })
  .check(ctx => {
    if (!getIsFileExists(ctx.value.zip)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.zip,
        message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value.zip)}`)
      });
    }
  });

export type ChromeOptions = z.infer<typeof ChromeOptionsSchema>;

export function prepareChromeOptions(options: ChromeOptions) {
  const correctedOptions = { ...options, zip: getCorrectZip(options.zip) };
  const result = ChromeOptionsSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
