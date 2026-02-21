import { red } from "../../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils/zip.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(`Firefox: ${message}`);
}

// https://mozilla.github.io/addons-server/topics/api/addons.html
export const FirefoxOptionsSubmissionApiSchema = z
  .object({
    extId: z.string().nonempty().describe("Get it from https://addons.mozilla.org/addon/EXT_ID"),
    jwtIssuer: z.string().nonempty().describe("Get it from https://addons.mozilla.org/developers/addon/api/key/"),
    jwtSecret: z.string().nonempty().describe("Get it from https://addons.mozilla.org/developers/addon/api/key/"),
    zip: z.string().nonempty().describe("Path to the ZIP file"),
    zipSource: z.string().optional().describe("Path to the source code ZIP"),
    changelog: z.string().optional().describe("Changelog for this version"),
    changelogLang: z.string().default("en-US").describe(`Changelog language code (default: manifest.json's "default_locale" or "en-US")`),
    devChangelog: z.string().optional().describe("Changelog for reviewers only")
  })
  .check(ctx => {
    if (!getIsFileExists(ctx.value.zip)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.zip,
        message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value.zip)}`)
      });
    }
    if (ctx.value.zipSource && !getIsFileExists(ctx.value.zipSource)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value.zipSource,
        message: storeError(`Zip source doesn't exist: ${getFullPath(ctx.value.zipSource)}`)
      });
    }
  });

export type FirefoxOptionsSubmissionApi = z.infer<typeof FirefoxOptionsSubmissionApiSchema>;

export function prepareFirefoxOptions(options: FirefoxOptionsSubmissionApi) {
  const correctedOptions = {
    ...options,
    zip: getCorrectZip(options.zip),
    zipSource: options.zipSource ? getCorrectZip(options.zipSource) : undefined,
    changelog: options.changelog?.replaceAll("\\n", "\n"),
    devChangelog: options.devChangelog?.replaceAll("\\n", "\n")
  };

  const result = FirefoxOptionsSubmissionApiSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
