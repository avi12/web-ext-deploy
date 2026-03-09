import { storeError } from "../../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils/zip.js";
import { z } from "zod";
// https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish
export const ChromeOptionsSchema = z.object({
    extId: z.string().nonempty().describe("Get it from https://chromewebstore.google.com/detail/EXT_ID"),
    publisherId: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md"),
    clientId: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md"),
    clientSecret: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md"),
    refreshToken: z.string().nonempty().describe("Follow https://github.com/avi12/web-ext-deploy/blob/main/CHROME_WEB_STORE_API.md"),
    zip: z.string().nonempty()
        .describe(`Path to the ZIP file. Supports "{version}" which is retrieved from package.json`)
        .transform(getCorrectZip)
        .check(ctx => {
        if (!getIsFileExists(ctx.value)) {
            ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value)}`) });
        }
    }),
    skipReview: z.boolean().optional().default(false).describe("Attempt to publish without waiting for a review"),
    deployPercentage: z.number().int().min(1).max(100).optional().describe("Staged rollout percentage (1–100) (default: 100)")
});
