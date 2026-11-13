import { defineStore, StoreName } from "@/types.js";

import { fetchOperaCredentials } from "./opera-credentials.js";
import { deployToOpera } from "./opera-deploy.js";
import { OperaOptionsSchema } from "./opera-input.js";

export const opera = defineStore({
  name: StoreName.OPERA,
  schema: OperaOptionsSchema,
  deploy: deployToOpera,
  credentialFields: ["sessionid", "csrftoken"],
  fetchCredentials: (_config, saveToEnv) => fetchOperaCredentials(saveToEnv),
  dynamicFields: ["changelog"]
});
