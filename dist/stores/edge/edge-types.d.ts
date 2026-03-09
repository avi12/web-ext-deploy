import { z } from "zod";
export declare const OperationStatus: {
    InProgress: "InProgress";
    Succeeded: "Succeeded";
    Failed: "Failed";
};
export declare const StatusPackageUploadSchema: z.ZodObject<{
    id: z.ZodString;
    createdTime: z.ZodString;
    lastUpdatedTime: z.ZodString;
    status: z.ZodEnum<{
        InProgress: "InProgress";
        Succeeded: "Succeeded";
        Failed: "Failed";
    }>;
    message: z.ZodNullable<z.ZodString>;
    errorCode: z.ZodNullable<z.ZodString>;
    errors: z.ZodNullable<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const PublishOperationStatusSchema: z.ZodUnion<readonly [z.ZodObject<{
    id: z.ZodString;
    message: z.ZodString;
    createdTime: z.ZodString;
    lastUpdatedTime: z.ZodString;
    status: z.ZodEnum<{
        InProgress: "InProgress";
        Succeeded: "Succeeded";
        Failed: "Failed";
    }>;
    errorCode: z.ZodNullable<z.ZodUnion<readonly [z.ZodEnum<{
        CreateNotAllowed: "CreateNotAllowed";
        NoModulesUpdated: "NoModulesUpdated";
        InProgressSubmission: "InProgressSubmission";
        UnpublishInProgress: "UnpublishInProgress";
        ModuleStateUnPublishable: "ModuleStateUnPublishable";
        SubmissionValidationError: "SubmissionValidationError";
    }>, z.ZodString]>>;
    errors: z.ZodNullable<z.ZodArray<z.ZodObject<{
        message: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    message: z.ZodString;
}, z.core.$strip>]>;
//# sourceMappingURL=edge-types.d.ts.map