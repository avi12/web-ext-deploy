import { z } from "zod";
export declare const ListVersionsSchema: z.ZodObject<{
    id: z.ZodNumber;
    slug: z.ZodString;
    name: z.ZodString;
    type: z.ZodString;
    versions: z.ZodArray<z.ZodObject<{
        version: z.ZodString;
        submitted_for_moderation: z.ZodBoolean;
        type: z.ZodString;
        created: z.ZodString;
        warnings: z.ZodArray<z.ZodString>;
        retirejs_warnings: z.ZodArray<z.ZodUnknown>;
    }, z.core.$strip>>;
    published_versions: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodObject<{
            version: z.ZodString;
            submitted_for_moderation: z.ZodBoolean;
            type: z.ZodString;
            created: z.ZodString;
            warnings: z.ZodArray<z.ZodString>;
            retirejs_warnings: z.ZodArray<z.ZodUnknown>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    developer: z.ZodString;
    is_editable: z.ZodBoolean;
    app_id: z.ZodString;
    category: z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>;
    warnings: z.ZodArray<z.ZodString>;
    unlisted: z.ZodBoolean;
    details_url: z.ZodString;
    is_published: z.ZodBoolean;
    available_auto_moderation: z.ZodBoolean;
    dev_promotional_image: z.ZodObject<{
        id: z.ZodNumber;
        url: z.ZodString;
    }, z.core.$strip>;
    is_extension: z.ZodBoolean;
    retirejs_warnings: z.ZodArray<z.ZodUnknown>;
}, z.core.$loose>;
export type ListVersions = z.infer<typeof ListVersionsSchema>;
export declare const ListingDetailSchema: z.ZodObject<{
    version: z.ZodString;
    submitted_for_moderation: z.ZodBoolean;
    source_url: z.ZodNullable<z.ZodString>;
    source_for_moderators_url: z.ZodNullable<z.ZodString>;
}, z.core.$loose>;
export declare const SubmitChangesSchema: z.ZodObject<{
    version: z.ZodString;
}, z.core.$loose>;
export declare const CancelChangesSchema: z.ZodObject<{
    version: z.ZodString;
}, z.core.$loose>;
export declare const UploadResultSchema: z.ZodUnion<readonly [z.ZodObject<{
    version: z.ZodString;
    submitted_for_moderation: z.ZodBoolean;
    type: z.ZodString;
    created: z.ZodString;
    warnings: z.ZodArray<z.ZodString>;
    retirejs_warnings: z.ZodArray<z.ZodUnknown>;
}, z.core.$strip>, z.ZodObject<{
    package_file: z.ZodString;
}, z.core.$strip>]>;
export type UploadResult = z.infer<typeof UploadResultSchema>;
export declare const FileUploadResponseSchema: z.ZodUnknown;
//# sourceMappingURL=opera-types.d.ts.map