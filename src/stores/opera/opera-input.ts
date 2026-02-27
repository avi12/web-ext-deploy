import { red } from "../../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils/zip.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(message);
}

export const OperaOptionsSchema = z.object({
  packageId: z.coerce.number().describe("Get it from https://addons.opera.com/developer/package/PACKAGE_ID"),
  sessionid: z.string().nonempty().describe("Get it by running --auto-fetch-cookies"),
  csrftoken: z.string().nonempty().describe("Get it by running --auto-fetch-cookies"),
  zip: z.string().nonempty()
    .describe(`Path to the ZIP file. Supports "{version}" which is retrieved from package.json `)
    .transform(getCorrectZip)
    .check(ctx => {
      if (!getIsFileExists(ctx.value)) {
        ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value)}`) });
      }
    }),
  changelog: z.string().optional().describe("Changelog for this version. Supports \\n")
});

export type OperaOptions = z.infer<typeof OperaOptionsSchema>;

export function prepareOperaOptions(options: unknown): OperaOptions {
  const parseResult = OperaOptionsSchema.safeParse(options);
  if (!parseResult.success) {
    throw parseResult.error;
  }
  return {
    ...parseResult.data,
    changelog: parseResult.data.changelog?.replaceAll("\\\\n", "\n")
  };
}
