import { z } from "zod";

// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-publishing-status
export const PublishOperationStatusSchema = z.object({
  id: z.string(),
  createdTime: z.string().optional(),
  lastUpdatedTime: z.string().optional(),
  status: z.enum(["InProgress", "Succeeded", "Failed"]).optional(),
  message: z.string(),
  errorCode: z.string().nullable().optional(),
  errors: z.array(z.object({ message: z.string() })).nullable().optional()
});

// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-status-of-a-package-upload
export const StatusPackageUploadSchema = z.object({
  id: z.string(),
  createdTime: z.string(),
  lastUpdatedTime: z.string(),
  status: z.enum(["InProgress", "Succeeded", "Failed"]),
  message: z.string().nullable(),
  errorCode: z.string().nullable(),
  errors: z.array(z.object({ message: z.string() })).nullable()
});
