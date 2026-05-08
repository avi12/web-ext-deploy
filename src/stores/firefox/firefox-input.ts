import { changelogField, optionalZipSourceField, requiredZipField } from "../shared-fields.js";
import { z } from "zod";

// https://mozilla.github.io/addons-server/topics/api/addons.html
export const FirefoxOptionsSubmissionApiSchema = z.object({
  extId: z.string().nonempty().describe("Get it from https://addons.mozilla.org/addon/EXT_ID"),
  jwtIssuer: z.string().nonempty().describe("Get it from https://addons.mozilla.org/developers/addon/api/key/"),
  jwtSecret: z.string().nonempty().describe("Get it from https://addons.mozilla.org/developers/addon/api/key/"),
  zip: requiredZipField(),
  zipSource: optionalZipSourceField(`Path to the source code ZIP. Supports "{version}" which is retrieved from package.json`),
  changelog: changelogField("Changelog for this version. Supports \\n"),
  changelogLang: z.string().default("en-US").describe(`Changelog language code (default: "en-US"). Full list: https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py#L3`),
  devChangelog: changelogField("Changelog for reviewers only")
});

export type FirefoxOptionsSubmissionApi = z.infer<typeof FirefoxOptionsSubmissionApiSchema>;
