import { defineStore, StoreName } from "../../types.js";
import { deployToEdgePublishApi } from "./edge-deploy.js";
import { EdgeOptionsPublishApiSchema } from "./edge-input.js";
export const edge = defineStore({
    name: StoreName.Edge,
    schema: EdgeOptionsPublishApiSchema,
    deploy: deployToEdgePublishApi,
    dynamicFields: ["devChangelog"]
});
