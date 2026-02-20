import { defineStore } from "../../types.js";
import { deployToEdgePublishApi } from "./edge-deploy.js";
import { EdgeOptionsPublishApiSchema, prepareEdgeOptions } from "./edge-input.js";

export const edge = defineStore({
  name: "edge",
  schema: EdgeOptionsPublishApiSchema,
  prepare: prepareEdgeOptions,
  deploy: deployToEdgePublishApi,
  dynamicFields: ["devChangelog"]
});
