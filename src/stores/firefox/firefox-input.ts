import { red } from "../../ui/logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils/zip.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(message);
}

// https://mozilla.github.io/addons-server/topics/api/addons.html
export const FirefoxOptionsSubmissionApiSchema = z.object({
  extId: z.string().nonempty().describe("Get it from https://addons.mozilla.org/addon/EXT_ID"),
  jwtIssuer: z.string().nonempty().describe("Get it from https://addons.mozilla.org/developers/addon/api/key/"),
  jwtSecret: z.string().nonempty().describe("Get it from https://addons.mozilla.org/developers/addon/api/key/"),
  zip: z.string().nonempty()
    .describe(`Path to the ZIP file. Supports "{version}" which is retrieved from package.json`)
    .transform(getCorrectZip)
    .check(ctx => {
      if (!getIsFileExists(ctx.value)) {
        ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Zip doesn't exist: ${getFullPath(ctx.value)}`) });
      }
    }),
  zipSource: z.string().optional()
    .describe(`Path to the source code ZIP. Supports "{version}" which is retrieved from package.json`)
    .transform(val => val ? getCorrectZip(val) : undefined)
    .check(ctx => {
      if (ctx.value && !getIsFileExists(ctx.value)) {
        ctx.issues.push({ code: "custom", input: ctx.value, message: storeError(`Zip source doesn't exist: ${getFullPath(ctx.value)}`) });
      }
    }),
  changelog: z.string().optional().describe("Changelog for this version. Supports \\n")
    .transform(changelog => changelog?.trim().replaceAll("\\n", "\n")),
  changelogLang: z.string().default("en-US").describe(`Changelog language code (default: manifest.json's "default_locale" or "en-US"). Full list: https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py#L3`),
  devChangelog: z.string().optional().describe("Changelog for reviewers only")
    .transform(changelog => changelog?.trim().replaceAll("\\n", "\n"))
});

export type FirefoxOptionsSubmissionApi = z.infer<typeof FirefoxOptionsSubmissionApiSchema>;

export function prepareFirefoxOptions(options: unknown): FirefoxOptionsSubmissionApi {
  const parseResult = FirefoxOptionsSubmissionApiSchema.safeParse(options);
  if (!parseResult.success) {
    throw parseResult.error;
  }
  return parseResult.data;
}
