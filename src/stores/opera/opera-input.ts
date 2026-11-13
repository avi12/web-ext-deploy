import { z } from "zod";

import { changelogField, requiredZipField } from "@/stores/shared-fields.js";

export const OperaOptionsSchema = z.object({
  packageId: z.coerce.number().describe("Get it from https://addons.opera.com/developer/package/PACKAGE_ID"),
  sessionid: z.string().nonempty().describe("Get it by running --auto-fetch-credentials"),
  csrftoken: z.string().nonempty().describe("Get it by running --auto-fetch-credentials"),
  zip: requiredZipField(),
  changelog: changelogField("Changelog for this version. Supports \\n")
});

export type OperaOptions = z.infer<typeof OperaOptionsSchema>;
