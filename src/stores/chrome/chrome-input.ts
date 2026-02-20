import { z } from "zod";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";

function getErrorMessage(message: string) {
  return `Chrome: ${message}`;
}

export const ChromeOptionsSchema = z
  .object({
    extId: z.string().nonempty(getErrorMessage("No extension ID is provided")).describe("Chrome Web Store extension ID"),
    publisherId: z.string().nonempty(getErrorMessage("No publisher ID is provided")).describe("Chrome Web Store publisher ID"),
    refreshToken: z.string().nonempty(getErrorMessage("No refresh token is provided")).describe("OAuth refresh token"),
    zip: z.string().nonempty(getErrorMessage("No zip is provided")).describe("Path to the ZIP file"),
    skipReview: z.boolean().optional().describe("Publish without waiting for a review"),
    deployPercentage: z.number().int().min(1).max(100).optional().describe("Staged rollout percentage (1–100)")
  })
  .check(ctx => {
    if (!getIsFileExists(ctx.value.zip)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.zip,
        message: getErrorMessage(`Zip doesn't exist: ${getFullPath(ctx.value.zip)}`)
      });
    }
  });

export type ChromeOptions = z.infer<typeof ChromeOptionsSchema>;

export function prepareChromeOptions(options: ChromeOptions) {
  const correctedOptions = { ...options,
    zip: getCorrectZip(options.zip) };
  const result = ChromeOptionsSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
