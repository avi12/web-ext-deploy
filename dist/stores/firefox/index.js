import { defineStore, StoreName } from "../../types.js";
import { deployToFirefox } from "./firefox-deploy.js";
import { FirefoxOptionsSubmissionApiSchema } from "./firefox-input.js";
export const firefox = defineStore({
    name: StoreName.Firefox,
    schema: FirefoxOptionsSubmissionApiSchema,
    deploy: deployToFirefox,
    dynamicFields: ["changelog", "devChangelog"],
    cliOverridableFields: ["changelogLang"]
});
