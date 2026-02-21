import { red } from "../../logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";
import { z } from "zod";

export function storeError (message: string) {
  return red(`Edge: ${message}`);
}

export const EdgeOptionsPublishApiSchema = z
  .object({
    productId: z.string().nonempty().describe("Get it from https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"),
    clientId: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"),
    apiKey: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"),
    zip: z.string().nonempty().describe("Path to the ZIP file"),
    devChangelog: z.string().optional().describe("Changelog for reviewers only")
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

export type EdgeOptionsPublishApi = z.infer<typeof EdgeOptionsPublishApiSchema>;

export function prepareEdgeOptions (options: EdgeOptionsPublishApi) {
  const correctedOptions = {
    ...options,
    zip: getCorrectZip(options.zip),
    devChangelog: options.devChangelog?.replace(/\/\n/g, "\n")
  };

  const result = EdgeOptionsPublishApiSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
