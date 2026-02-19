import deployToOpera from "./opera-deploy.js";
import { OperaOptionsSchema, prepareOperaOptions } from "./opera-input.js";
import { defineStore } from "../../types.js";

export const opera = defineStore({
  name: "opera",
  schema: OperaOptionsSchema,
  prepare: prepareOperaOptions,
  deploy: deployToOpera,
  cookieFields: ["sessionid", "csrftoken"]
});
