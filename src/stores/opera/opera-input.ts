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
  zip: z.string().nonempty().describe(`Path to the ZIP file. Supports "{version}" which is retrieved from package.json `),
  changelog: z.string().optional().describe("Changelog for this version. Supports \\n")
});

export type OperaOptions = z.infer<typeof OperaOptionsSchema>;

export function prepareOperaOptions(options: OperaOptions) {
  const correctedOptions = {
    ...options,
    zip: getCorrectZip(options.zip),
    changelog: options.changelog?.replaceAll("\\\\n", "\n")
  };

  if (!getIsFileExists(correctedOptions.zip)) {
    throw new Error(storeError(`Zip doesn't exist: ${getFullPath(correctedOptions.zip)}`));
  }

  const result = OperaOptionsSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
