import { defineStore, StoreName } from "../../types.js";
import { deployToFirefox } from "./firefox-deploy.js";
import { FirefoxOptionsSubmissionApiSchema, prepareFirefoxOptions } from "./firefox-input.js";

export const firefox = defineStore({
  name: StoreName.Firefox,
  schema: FirefoxOptionsSubmissionApiSchema,
  prepare: prepareFirefoxOptions,
  deploy: deployToFirefox,
  dynamicFields: ["changelog", "devChangelog"],
  cliOverridableFields: ["changelogLang"]
});
