import ChromeUpload from "chrome-webstore-upload";
import { ChromeOptions } from "./chrome-input";
import * as fs from "fs";

export async function deployToChrome(options: ChromeOptions) {
  const client = ChromeUpload({
    extensionId: options.extId,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    refreshToken: options.refreshToken
  });

  if (options.verbose) {
    console.log("Uploading...");
  }

  try {
    await client.uploadExisting(fs.createReadStream(options.zip));
  } catch (e) {
    throw new Error(`Chrome: ${e}`);
  }

  console.log("Uploaded to Chrome Web Store");
  return true;
}
