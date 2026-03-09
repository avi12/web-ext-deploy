import { z } from "zod";
export declare const UploadState: {
    UPLOAD_STATE_UNSPECIFIED: "UPLOAD_STATE_UNSPECIFIED";
    SUCCEEDED: "SUCCEEDED";
    IN_PROGRESS: "IN_PROGRESS";
    FAILED: "FAILED";
    NOT_FOUND: "NOT_FOUND";
};
export declare const UploadResponseSchema: z.ZodObject<{
    name: z.ZodString;
    itemId: z.ZodOptional<z.ZodString>;
    crxVersion: z.ZodOptional<z.ZodString>;
    uploadState: z.ZodEnum<{
        UPLOAD_STATE_UNSPECIFIED: "UPLOAD_STATE_UNSPECIFIED";
        SUCCEEDED: "SUCCEEDED";
        IN_PROGRESS: "IN_PROGRESS";
        FAILED: "FAILED";
        NOT_FOUND: "NOT_FOUND";
    }>;
}, z.core.$strip>;
export declare const ItemState: {
    ITEM_STATE_UNSPECIFIED: "ITEM_STATE_UNSPECIFIED";
    PENDING_REVIEW: "PENDING_REVIEW";
    STAGED: "STAGED";
    PUBLISHED: "PUBLISHED";
    PUBLISHED_TO_TESTERS: "PUBLISHED_TO_TESTERS";
    REJECTED: "REJECTED";
    CANCELLED: "CANCELLED";
};
export declare const PublishResponseSchema: z.ZodObject<{
    name: z.ZodString;
    itemId: z.ZodOptional<z.ZodString>;
    state: z.ZodEnum<{
        ITEM_STATE_UNSPECIFIED: "ITEM_STATE_UNSPECIFIED";
        PENDING_REVIEW: "PENDING_REVIEW";
        STAGED: "STAGED";
        PUBLISHED: "PUBLISHED";
        PUBLISHED_TO_TESTERS: "PUBLISHED_TO_TESTERS";
        REJECTED: "REJECTED";
        CANCELLED: "CANCELLED";
    }>;
}, z.core.$strip>;
export declare const FetchStatusSchema: z.ZodObject<{
    name: z.ZodString;
    itemId: z.ZodOptional<z.ZodString>;
    publicKey: z.ZodOptional<z.ZodString>;
    publishedItemRevisionStatus: z.ZodOptional<z.ZodObject<{
        state: z.ZodEnum<{
            ITEM_STATE_UNSPECIFIED: "ITEM_STATE_UNSPECIFIED";
            PENDING_REVIEW: "PENDING_REVIEW";
            STAGED: "STAGED";
            PUBLISHED: "PUBLISHED";
            PUBLISHED_TO_TESTERS: "PUBLISHED_TO_TESTERS";
            REJECTED: "REJECTED";
            CANCELLED: "CANCELLED";
        }>;
        distributionChannels: z.ZodOptional<z.ZodArray<z.ZodObject<{
            deployPercentage: z.ZodOptional<z.ZodNumber>;
            crxVersion: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    submittedItemRevisionStatus: z.ZodOptional<z.ZodObject<{
        state: z.ZodEnum<{
            ITEM_STATE_UNSPECIFIED: "ITEM_STATE_UNSPECIFIED";
            PENDING_REVIEW: "PENDING_REVIEW";
            STAGED: "STAGED";
            PUBLISHED: "PUBLISHED";
            PUBLISHED_TO_TESTERS: "PUBLISHED_TO_TESTERS";
            REJECTED: "REJECTED";
            CANCELLED: "CANCELLED";
        }>;
        distributionChannels: z.ZodOptional<z.ZodArray<z.ZodObject<{
            deployPercentage: z.ZodOptional<z.ZodNumber>;
            crxVersion: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    lastAsyncUploadState: z.ZodOptional<z.ZodEnum<{
        UPLOAD_STATE_UNSPECIFIED: "UPLOAD_STATE_UNSPECIFIED";
        SUCCEEDED: "SUCCEEDED";
        IN_PROGRESS: "IN_PROGRESS";
        FAILED: "FAILED";
        NOT_FOUND: "NOT_FOUND";
    }>>;
    takenDown: z.ZodOptional<z.ZodBoolean>;
    warned: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
//# sourceMappingURL=chrome-types.d.ts.map