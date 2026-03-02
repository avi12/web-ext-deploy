import { defineStore, StoreName } from "../../types.js";
import { deployToOpera } from "./opera-deploy.js";
import { OperaOptionsSchema } from "./opera-input.js";

export const opera = defineStore({
  name: StoreName.Opera,
  schema: OperaOptionsSchema,
  deploy: deployToOpera,
  cookieFields: ["sessionid", "csrftoken"],
  dynamicFields: ["changelog"]
});
