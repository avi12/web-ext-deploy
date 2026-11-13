import { z } from "zod";

const UploadStateSchema = z.enum(["UPLOAD_STATE_UNSPECIFIED", "SUCCEEDED", "IN_PROGRESS", "FAILED", "NOT_FOUND"]);
export const UploadState = UploadStateSchema.enum;

// https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload
export const UploadResponseSchema = z.object({
  name: z.string(),
  itemId: z.string().optional(),
  crxVersion: z.string().optional(),
  uploadState: UploadStateSchema
});

const ItemStateSchema = z.enum([
  "ITEM_STATE_UNSPECIFIED",
  "PENDING_REVIEW",
  "STAGED",
  "PUBLISHED",
  "PUBLISHED_TO_TESTERS",
  "REJECTED",
  "CANCELLED"
]);
export const ItemState = ItemStateSchema.enum;

// https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish
export const PublishResponseSchema = z.object({
  name: z.string(),
  itemId: z.string().optional(),
  state: ItemStateSchema
});

const DistributionChannelSchema = z.object({
  deployPercentage: z.number().optional(),
  crxVersion: z.string().optional()
});

const ItemRevisionStatusSchema = z.object({
  state: ItemStateSchema,
  distributionChannels: z.array(DistributionChannelSchema).optional()
});

// https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus
export const FetchStatusSchema = z.object({
  name: z.string(),
  itemId: z.string().optional(),
  publicKey: z.string().optional(),
  publishedItemRevisionStatus: ItemRevisionStatusSchema.optional(),
  submittedItemRevisionStatus: ItemRevisionStatusSchema.optional(),
  lastAsyncUploadState: UploadStateSchema.optional(),
  takenDown: z.boolean().optional(),
  warned: z.boolean().optional()
});
