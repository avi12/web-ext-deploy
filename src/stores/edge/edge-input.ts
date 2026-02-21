import { red } from "../../logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(`Edge: ${message}`);
}

export const EdgeOptionsPublishApiSchema = z
  .object({
    productId: z
      .string()
      .nonempty(
        storeError(
          "No product ID is provided, e.g. https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"
        )
      )
      .describe("Product ID from the Edge Partner Dashboard"),
    clientId: z
      .string()
      .nonempty(
        storeError(
          "No client ID is provided. To obtain one, follow https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"
        )
      )
      .describe("Edge Publish API client ID"),
    apiKey: z
      .string()
      .nonempty(
        storeError(
          "No API key is provided. To obtain one, follow https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"
        )
      )
      .describe("Edge Publish API key"),
    zip: z.string().nonempty(storeError("No zip is provided")).describe("Path to the ZIP file"),
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

export function prepareEdgeOptions(options: EdgeOptionsPublishApi) {
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
