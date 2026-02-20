import { defineStore } from "../../types.js";
import { deployToChrome } from "./chrome-deploy.js";
import { ChromeOptionsSchema, prepareChromeOptions } from "./chrome-input.js";

export const chrome = defineStore({
  name: "chrome",
  schema: ChromeOptionsSchema,
  prepare: prepareChromeOptions,
  deploy: deployToChrome,
  dynamicFields: ["skipReview", "deployPercentage"]
});
