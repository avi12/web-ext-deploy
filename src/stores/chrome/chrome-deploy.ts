import ChromeUpload from "chrome-webstore-upload";
import { ChromeOptions } from "./chrome-input";
import * as fs from "fs";
import { getVerboseMessage } from "../../utils";

const store = "Chrome";

export async function deployToChrome(options: ChromeOptions) {
  return new Promise(async (resolve, reject) => {
    const client = ChromeUpload({
      extensionId: options.extId,
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      refreshToken: options.refreshToken
    });

    if (options.verbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Updating extension with ID ${options.extId}`
        })
      );
    }

    const { uploadState, itemError } = await client.uploadExisting(
      fs.createReadStream(options.zip)
    );
    if (uploadState === "FAILURE") {
      const errors = itemError.map(({ error_detail }) => error_detail);
      reject(
        getVerboseMessage({
          store,
          message: `Item "${options.extId}":
          ${errors.join("\n")}`,
          prefix: "Error"
        })
      );
      return;
    }

    resolve(true);
  });
}
