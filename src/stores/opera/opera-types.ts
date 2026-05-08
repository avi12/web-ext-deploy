import { z } from "zod";

const VersionEntrySchema = z.object({
  version: z.string(),
  submitted_for_moderation: z.boolean(),
  type: z.string(),
  created: z.string(),
  warnings: z.array(z.string()),
  retirejs_warnings: z.array(z.unknown())
});

export const ListVersionsSchema = z.looseObject({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  versions: z.array(VersionEntrySchema),
  published_versions: z.array(
    z.object({
      name: z.string(),
      version: VersionEntrySchema
    })
  ),
  developer: z.string(),
  is_editable: z.boolean(),
  app_id: z.string(),
  category: z.object({
    slug: z.string(),
    name: z.string()
  }),
  warnings: z.array(z.string()),
  unlisted: z.boolean(),
  details_url: z.string(),
  is_published: z.boolean(),
  available_auto_moderation: z.boolean(),
  dev_promotional_image: z.object({
    id: z.number(),
    url: z.string()
  }).nullable(),
  is_extension: z.boolean(),
  retirejs_warnings: z.array(z.unknown())
});

export type ListVersions = z.infer<typeof ListVersionsSchema>;

export const ListingDetailSchema = z.looseObject({
  version: z.string(),
  submitted_for_moderation: z.boolean().optional(),
  source_url: z.string().nullish(),
  source_for_moderators_url: z.string().nullish()
});

const DidChangesSchema = z.looseObject({ version: z.string() });

export const SubmitChangesSchema = DidChangesSchema;

export const CancelChangesSchema = DidChangesSchema;

const UploadResultSuccessSchema = z.object({
  version: z.string(),
  submitted_for_moderation: z.boolean(),
  type: z.string(),
  created: z.string(),
  warnings: z.array(z.string()),
  retirejs_warnings: z.array(z.unknown())
});

const UploadResultErrorSchema = z.object({ package_file: z.string() });

export const UploadResultSchema = z.union([UploadResultSuccessSchema, UploadResultErrorSchema]);
export type UploadResult = z.infer<typeof UploadResultSchema>;

export const FileUploadResponseSchema = z.unknown();
