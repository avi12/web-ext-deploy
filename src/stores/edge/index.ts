import { deployToEdgePublishApi } from "./edge-deploy.js";
import { EdgeOptionsPublishApiSchema, prepareEdgeOptions } from "./edge-input.js";
import { defineStore } from "../../types.js";

export const edge = defineStore({
  name: "edge",
  schema: EdgeOptionsPublishApiSchema,
  prepare: prepareEdgeOptions,
  deploy: deployToEdgePublishApi,
  dynamicFields: ["devChangelog"]
});
