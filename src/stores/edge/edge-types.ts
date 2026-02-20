import { z } from "zod";

const BasePublishStatusSchema = z.object({
  id: z.string(),
  createdTime: z.string().optional(),
  lastUpdatedTime: z.string().optional(),
  status: z.string().optional(),
  message: z.string(),
  errorCode: z.string().nullable().optional(),
  errors: z.array(z.object({ message: z.string() })).nullable().optional()
});

export const PublishOperationStatusSchema = BasePublishStatusSchema;

export const StatusPackageUploadSchema = z.object({
  id: z.string(),
  createdTime: z.string().optional(),
  lastUpdatedTime: z.string().optional(),
  status: z.enum(["InProgress", "Succeeded", "Failed"]),
  message: z.string().nullable(),
  errorCode: z.string().nullable().optional(),
  errors: z.array(z.object({ message: z.string() })).nullable().optional()
});

export type StatusPackageUpload = z.infer<typeof StatusPackageUploadSchema>;
