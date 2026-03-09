import { z } from "zod";
const OperationStatusSchema = z.enum(["InProgress", "Succeeded", "Failed"]);
export const OperationStatus = OperationStatusSchema.enum;
// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-status-of-a-package-upload
export const StatusPackageUploadSchema = z.object({
    id: z.string(),
    createdTime: z.string(),
    lastUpdatedTime: z.string(),
    status: OperationStatusSchema,
    message: z.string().nullable(),
    errorCode: z.string().nullable(),
    errors: z.array(z.string()).nullable()
});
const PublishErrorCode = z.enum([
    "CreateNotAllowed",
    "NoModulesUpdated",
    "InProgressSubmission",
    "UnpublishInProgress",
    "ModuleStateUnPublishable",
    "SubmissionValidationError"
]);
const BaseOperationResponse = z.object({
    id: z.string(),
    message: z.string()
});
// https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-publishing-status
export const PublishOperationStatusSchema = z.union([
    BaseOperationResponse.extend({
        createdTime: z.string(),
        lastUpdatedTime: z.string(),
        status: OperationStatusSchema,
        errorCode: z.union([PublishErrorCode, z.string()]).nullable(),
        errors: z.array(z.object({ message: z.string() })).nullable()
    }),
    BaseOperationResponse
]);
