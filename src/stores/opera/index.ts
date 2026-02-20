import { defineStore } from "../../types.js";
import { deployToOpera } from "./opera-deploy.js";
import { OperaOptionsSchema, prepareOperaOptions } from "./opera-input.js";

export const opera = defineStore({
  name: "opera",
  schema: OperaOptionsSchema,
  prepare: prepareOperaOptions,
  deploy: deployToOpera,
  cookieFields: ["sessionid", "csrftoken"],
  dynamicFields: ["changelog"]
});
