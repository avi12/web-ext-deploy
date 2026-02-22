import { red } from "../../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils/zip.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(`Chrome: ${message}`);
}

// https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish
export const ChromeOptionsSchema = z
  .object({
    extId: z.string().nonempty().describe("Get it from https://chromewebstore.google.com/detail/EXT_ID"),
    publisherId: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md"),
    refreshToken: z.string().nonempty().describe("Get it from: web-ext-deploy chrome-token --client-id CLIENT_ID --client-secret CLIENT_SECRET"),
    zip: z.string().nonempty().describe(`Path to the ZIP file. Supports "{version}" which is retrieved from package.json`),
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
