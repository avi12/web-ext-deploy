import ChromeUpload from "chrome-webstore-upload";
import { ChromeOptions } from "./chrome-input";
import * as fs from "fs";
import { getVerboseMessage } from "../../utils";

const store = "Chrome";

export async function deployToChrome({
  extId: extensionId,
  clientId,
  clientSecret,
  refreshToken,
  verbose,
  zip
}: ChromeOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const client = ChromeUpload({
      extensionId,
      clientId,
      clientSecret,
      refreshToken
    });

    if (verbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Updating extension with ID ${extensionId}`
        })
      );
    }

    const { uploadState, itemError } = await client.uploadExisting(
      fs.createReadStream(zip)
    );
    if (uploadState === "FAILURE") {
      const errors = itemError.map(({ error_detail }) => error_detail);
      reject(
        getVerboseMessage({
          store,
          message: `Item "${extensionId}":
          ${errors.join("\n")}`,
          prefix: "Error"
        })
      );
      return;
    }

    resolve(true);
  });
}
