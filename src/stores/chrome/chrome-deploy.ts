import ChromeUpload from "chrome-webstore-upload";
import { ChromeOptions } from "./chrome-input";
import fs from "fs";
import { getExtInfo, getVerboseMessage, logSuccessfullyPublished } from "../../utils";

const STORE = "Chrome";

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
          store: STORE,
          message: `Updating extension with ID ${extensionId}`
        })
      );
    }

    const { uploadState, itemError } = await client.uploadExisting(fs.createReadStream(zip));

    if (uploadState === "FAILURE") {
      const errors = itemError.map(({ error_detail }) => error_detail);
      reject(
        getVerboseMessage({
          store: STORE,
          message: `Item "${extensionId}" (${getExtInfo(zip, "name")}):
          ${errors.join("\n")}`,
          prefix: "Error"
        })
      );
      return;
    }

    await client.publish();

    logSuccessfullyPublished({ extId: extensionId, store: STORE, zip });

    resolve(true);
  });
}
