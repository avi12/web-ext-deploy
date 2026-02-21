import { red } from "../../logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(`Opera: ${message}`);
}

export const OperaOptionsSchema = z
  .object({
    packageId: z.coerce.number().describe("Get it from https://addons.opera.com/developer/package/PACKAGE_ID"),
    sessionid: z.string().nonempty().describe("Get it by running --auto-fetch-cookies"),
    csrftoken: z.string().nonempty().describe("Get it by running --auto-fetch-cookies"),
    zip: z.string().nonempty().describe("Path to the ZIP file"),
    changelog: z.string().optional().describe("Changelog for this version")
  })
  .check(ctx => {
    if (!getIsFileExists(ctx.value.zip)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.zip,
        message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value.zip)}`)
      });
    }
  });

export type OperaOptions = z.infer<typeof OperaOptionsSchema>;

export function prepareOperaOptions(options: OperaOptions) {
  const correctedOptions = {
    ...options,
    zip: getCorrectZip(options.zip),
    changelog: options.changelog?.replaceAll("\\\\n", "\n")
  };

  const result = OperaOptionsSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
