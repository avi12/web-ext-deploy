import { changelogField, requiredZipField } from "../shared-fields.js";
import { z } from "zod";

// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api
export const EdgeOptionsPublishApiSchema = z.object({
  productId: z.string().nonempty().describe("Get it from https://partner.microsoft.com/en-us/dashboard/microsoftedge/PRODUCT_ID"),
  clientId: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"),
  apiKey: z.string().nonempty().describe("Get it from https://github.com/avi12/web-ext-deploy/blob/main/EDGE_PUBLISH_API.md"),
  zip: requiredZipField("Path to the ZIP file"),
  devChangelog: changelogField("Changelog for reviewers only")
});

export type EdgeOptionsPublishApi = z.infer<typeof EdgeOptionsPublishApiSchema>;
