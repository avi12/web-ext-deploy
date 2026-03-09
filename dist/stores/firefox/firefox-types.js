import { z } from "zod";
const FirefoxErrorMessageSchema = z.object({
    message: z.string(),
    description: z.string().optional(),
    instancePath: z.string().optional(),
    type: z.enum(["error", "warning"]),
    id: z.array(z.string()).optional(),
    tier: z.number().optional()
});
// https://mozilla.github.io/addons-server/topics/api/addons.html#upload-detail
export const FirefoxUploadDetailSchema = z.object({
    uuid: z.string(),
    channel: z.enum(["listed", "unlisted"]),
    processed: z.boolean(),
    submitted: z.boolean(),
    url: z.string(),
    valid: z.boolean(),
    validation: z.object({ messages: z.array(FirefoxErrorMessageSchema).optional() }).nullable(),
    version: z.string(),
    detail: z.string().optional()
});
// https://mozilla.github.io/addons-server/topics/api/addons.html#version-create
export const FirefoxCreateNewVersionSchema = z
    .looseObject({
    id: z.number(),
    approval_notes: z.string(),
    channel: z.enum(["listed", "unlisted"]),
    compatibility: z.object({
        firefox: z.object({
            min: z.string(),
            max: z.string()
        }).optional()
    }),
    edit_url: z.string(),
    file: z.object({
        id: z.number(),
        created: z.string(),
        hash: z.string(),
        is_mozilla_signed_extension: z.boolean(),
        size: z.number(),
        status: z.string(),
        url: z.string(),
        permissions: z.array(z.string()),
        optional_permissions: z.array(z.string()),
        host_permissions: z.array(z.string())
    }),
    is_disabled: z.boolean(),
    is_strict_compatibility_enabled: z.boolean(),
    license: z.object({
        id: z.number(),
        is_custom: z.boolean(),
        name: z.record(z.string(), z.string()),
        slug: z.string(),
        text: z.record(z.string(), z.string()),
        url: z.string()
    }),
    release_notes: z.record(z.string(), z.string()),
    reviewed: z.string().nullable(),
    source: z.string().nullable(),
    version: z.string()
});
// https://mozilla.github.io/addons-server/topics/api/addons.html#version-sources
export const FirefoxUploadSourceSchema = FirefoxCreateNewVersionSchema;
