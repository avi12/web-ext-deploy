import { defineStore, StoreName } from "../../types.js";
import { config } from "../../utils/dotenv.js";
import { createGitIgnoreIfNeeded, headersToEnv } from "../../utils/helpers.js";
import { getChromeRefreshToken } from "./chrome-credentials.js";
import { deployToChrome } from "./chrome-deploy.js";
import { ChromeOptionsSchema } from "./chrome-input.js";
import fs from "node:fs";

export const chrome = defineStore({
  name: StoreName.Chrome,
  schema: ChromeOptionsSchema,
  deploy: deployToChrome,
  credentialFields: ["refreshToken"],
  async fetchCredentials(storeConfig, saveToEnv) {
    const clientId = String(storeConfig.clientId ?? "");
    const clientSecret = String(storeConfig.clientSecret ?? "");

    const isMissingCredentials = !clientId || !clientSecret;
    if (isMissingCredentials) {
      throw new Error("Chrome credentials auto-fetch requires both 'clientId' and 'clientSecret'");
    }

    const refreshToken = await getChromeRefreshToken(clientId, clientSecret);
    if (saveToEnv) {
      const envFile = "chrome.env";
      const { parsed: envCurrent = {} } = config({ path: envFile });
      fs.writeFileSync(envFile, headersToEnv({ ...envCurrent, REFRESH_TOKEN: refreshToken }));
      createGitIgnoreIfNeeded([StoreName.Chrome]);
    }

    return { refreshToken };
  },
  dynamicFields: ["skipReview", "deployPercentage"]
});
