import { red } from "../../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils/zip.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(message);
}

// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
export const EdgeOptionsPublishApiSchema = z.object({
  productId: z.string().nonempty().describe("Get it from https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"),
  clientId: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"),
  apiKey: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"),
  zip: z.string().nonempty()
    .describe("Path to the ZIP file")
    .transform(getCorrectZip)
    .check(ctx => {
      if (!getIsFileExists(ctx.value)) {
        ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value)}`) });
      }
    }),
  devChangelog: z.string().optional().describe("Changelog for reviewers only")
});

export type EdgeOptionsPublishApi = z.infer<typeof EdgeOptionsPublishApiSchema>;

export function prepareEdgeOptions(options: unknown): EdgeOptionsPublishApi {
  const parseResult = EdgeOptionsPublishApiSchema.safeParse(options);
  if (!parseResult.success) {
    throw parseResult.error;
  }
  return {
    ...parseResult.data,
    devChangelog: parseResult.data.devChangelog?.replaceAll("\\n", "\n")
  };
}
