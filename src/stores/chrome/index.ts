import { deployToChrome } from "./chrome-deploy.js";
import { ChromeOptionsSchema, prepareChromeOptions } from "./chrome-input.js";
import { defineStore } from "../../types.js";

export const chrome = defineStore({
  name: "chrome",
  schema: ChromeOptionsSchema,
  prepare: prepareChromeOptions,
  deploy: deployToChrome
});
