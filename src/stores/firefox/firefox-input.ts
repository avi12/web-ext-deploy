import { red } from "../../logging.js";
import { getCorrectZip, getFullPath, getIsFileExists } from "../../utils.js";
import { z } from "zod";

export function storeError(message: string) {
  return red(`Firefox: ${message}`);
}

export const FirefoxOptionsSubmissionApiSchema = z
  .object({
    extId: z
      .string()
      .min(1, storeError("No extension ID is provided, e.g. https://addons.mozilla.org/addon/EXT_ID"))
      .describe("Extension ID from addons.mozilla.org/addon/EXT_ID"),

    jwtIssuer: z
      .string()
      .min(
        1,
        storeError("No JWT issuer is provided. Get it from https://addons.mozilla.org/developers/addon/api/key/")
      )
      .describe("JWT issuer from the Developer Hub"),

    jwtSecret: z
      .string()
      .min(
        1,
        storeError("No JWT secret is provided. Get it from https://addons.mozilla.org/developers/addon/api/key/")
      )
      .describe("JWT secret from the Developer Hub"),

    zip: z.string().min(1, storeError("No zip is provided")).describe("Path to the ZIP file"),

    zipSource: z.string().optional().describe("Path to the source code ZIP"),

    changelog: z.string().optional().describe("Changelog for this version"),

    changelogLang: z.string().default("en-US").describe("Language code for the changelog"),

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
    changelog: options.changelog?.replace(/\/\/n/g, "\n"),
    devChangelog: options.devChangelog?.replace(/\/\/n/g, "\n")
  };

  const result = FirefoxOptionsSubmissionApiSchema.safeParse(correctedOptions);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}
