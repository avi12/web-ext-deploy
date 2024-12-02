import ChromeUpload from "chrome-webstore-upload";
import { ChromeOptions } from "./chrome-input.js";
import type { SupportedStoresCapitalized } from "../../types.js";
import { getErrorMessage, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE: SupportedStoresCapitalized = "Chrome";

export async function deployToChrome({
  extId: extensionId,
  clientId,
  clientSecret,
  refreshToken,
  verbose: isVerbose,
  zip
}: ChromeOptions): Promise<boolean> {
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
    const errors = itemError.map(({ error_detail }) => error_detail);
    throw getErrorMessage({ store: STORE, error: errors.join("\n"), actionName: "proceed to update", zip });
  }

  await client.publish();

  logSuccessfullyPublished({ extId: extensionId, store: STORE, zip });
  return true;
}
