import deployToFirefox from "./firefox-deploy.js";
import { FirefoxOptionsSubmissionApiSchema, prepareFirefoxOptions } from "./firefox-input.js";
import { defineStore } from "../../types.js";

export const firefox = defineStore({
  name: "firefox",
  schema: FirefoxOptionsSubmissionApiSchema,
  prepare: prepareFirefoxOptions,
  deploy: deployToFirefox
});
