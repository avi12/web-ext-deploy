import { defineStore, StoreName } from "../../types.js";
import { deployToChrome } from "./chrome-deploy.js";
import { ChromeOptionsSchema } from "./chrome-input.js";

export const chrome = defineStore({
  name: StoreName.Chrome,
  schema: ChromeOptionsSchema,
  deploy: deployToChrome,
  dynamicFields: ["skipReview", "deployPercentage"]
});
