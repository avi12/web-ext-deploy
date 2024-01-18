import ChromeUpload from "chrome-webstore-upload";
import { ChromeOptions } from "./chrome-input.js";
import { getExtInfo, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE = "Chrome";

export async function deployToChrome({
  extId: extensionId,
  clientId,
  clientSecret,
  refreshToken,
  verbose: isVerbose,
  zip
}: ChromeOptions): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    const client = ChromeUpload({
      extensionId,
      clientId,
      clientSecret,
      refreshToken
    });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Updating extension with ID ${extensionId}`
        })
      );
    }

    const { uploadState, itemError } = await client.uploadExisting(fs.createReadStream(zip));

    if (uploadState === "FAILURE") {
      // @ts-ignore
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
