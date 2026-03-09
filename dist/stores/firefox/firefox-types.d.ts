import { z } from "zod";
export declare const FirefoxUploadDetailSchema: z.ZodObject<{
    uuid: z.ZodString;
    channel: z.ZodEnum<{
        listed: "listed";
        unlisted: "unlisted";
    }>;
    processed: z.ZodBoolean;
    submitted: z.ZodBoolean;
    url: z.ZodString;
    valid: z.ZodBoolean;
    validation: z.ZodNullable<z.ZodObject<{
        messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
            message: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            instancePath: z.ZodOptional<z.ZodString>;
            type: z.ZodEnum<{
                error: "error";
                warning: "warning";
            }>;
            id: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tier: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    version: z.ZodString;
    detail: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const FirefoxCreateNewVersionSchema: z.ZodObject<{
    id: z.ZodNumber;
    approval_notes: z.ZodString;
    channel: z.ZodEnum<{
        listed: "listed";
        unlisted: "unlisted";
    }>;
    compatibility: z.ZodObject<{
        firefox: z.ZodOptional<z.ZodObject<{
            min: z.ZodString;
            max: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    edit_url: z.ZodString;
    file: z.ZodObject<{
        id: z.ZodNumber;
        created: z.ZodString;
        hash: z.ZodString;
        is_mozilla_signed_extension: z.ZodBoolean;
        size: z.ZodNumber;
        status: z.ZodString;
        url: z.ZodString;
        permissions: z.ZodArray<z.ZodString>;
        optional_permissions: z.ZodArray<z.ZodString>;
        host_permissions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    is_disabled: z.ZodBoolean;
    is_strict_compatibility_enabled: z.ZodBoolean;
    license: z.ZodObject<{
        id: z.ZodNumber;
        is_custom: z.ZodBoolean;
        name: z.ZodRecord<z.ZodString, z.ZodString>;
        slug: z.ZodString;
        text: z.ZodRecord<z.ZodString, z.ZodString>;
        url: z.ZodString;
    }, z.core.$strip>;
    release_notes: z.ZodRecord<z.ZodString, z.ZodString>;
    reviewed: z.ZodNullable<z.ZodString>;
    source: z.ZodNullable<z.ZodString>;
    version: z.ZodString;
}, z.core.$loose>;
export declare const FirefoxUploadSourceSchema: z.ZodObject<{
    id: z.ZodNumber;
    approval_notes: z.ZodString;
    channel: z.ZodEnum<{
        listed: "listed";
        unlisted: "unlisted";
    }>;
    compatibility: z.ZodObject<{
        firefox: z.ZodOptional<z.ZodObject<{
            min: z.ZodString;
            max: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    edit_url: z.ZodString;
    file: z.ZodObject<{
        id: z.ZodNumber;
        created: z.ZodString;
        hash: z.ZodString;
        is_mozilla_signed_extension: z.ZodBoolean;
        size: z.ZodNumber;
        status: z.ZodString;
        url: z.ZodString;
        permissions: z.ZodArray<z.ZodString>;
        optional_permissions: z.ZodArray<z.ZodString>;
        host_permissions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    is_disabled: z.ZodBoolean;
    is_strict_compatibility_enabled: z.ZodBoolean;
    license: z.ZodObject<{
        id: z.ZodNumber;
        is_custom: z.ZodBoolean;
        name: z.ZodRecord<z.ZodString, z.ZodString>;
        slug: z.ZodString;
        text: z.ZodRecord<z.ZodString, z.ZodString>;
        url: z.ZodString;
    }, z.core.$strip>;
    release_notes: z.ZodRecord<z.ZodString, z.ZodString>;
    reviewed: z.ZodNullable<z.ZodString>;
    source: z.ZodNullable<z.ZodString>;
    version: z.ZodString;
}, z.core.$loose>;
//# sourceMappingURL=firefox-types.d.ts.map