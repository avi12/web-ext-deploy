import { z } from "zod";
import { ChromeOptions } from "./chrome-input.js";
import { createHttpClient } from "../../http-client.js";
import type { CookieRefreshCallback, StoreLogger } from "../../types.js";
import { getErrorMessage } from "../../utils.js";
import fs from "node:fs";

const STORE = "Chrome";
const BASE_URL = "https://chromewebstore.googleapis.com";

let httpClient: ReturnType<typeof createHttpClient>;
let uploadHttpClient: ReturnType<typeof createHttpClient>;

const UploadResponseSchema = z.object({
  state: z.string(),
  itemError: z.array(z.object({ error_detail: z.string() })).optional()
});

const PublishResponseSchema = z.object({
  state: z.string().optional()
});

async function uploadZip({
  zip,
  extId,
  publisherId
}: {
  zip: string;
  extId: string;
  publisherId: string;
}) {
  const response = await uploadHttpClient.post(
    `upload/v2/publishers/${publisherId}/items/${extId}:upload`,
    fs.createReadStream(zip),
    {
      headers: {
        "Content-Type": "application/zip"
      }
    }
  );

  const data = UploadResponseSchema.parse(response.data);
  if (data.state === "SUCCESS") {
    return;
  }
  const errors = data.itemError?.map(({ error_detail }) => error_detail) || ["Unknown upload error"];
  throw getErrorMessage({
    store: STORE,
    error: errors.join("\n"),
    actionName: "upload",
    zip
  });
}

async function publishExtension({
  extId,
  publisherId
}: {
  extId: string;
  publisherId: string;
}) {
  const response = await httpClient.post(`v2/publishers/${publisherId}/items/${extId}:publish`);

  const data = PublishResponseSchema.parse(response.data);
  if (data.state === "SUCCESS") {
    return;
  }
  throw getErrorMessage({
    store: STORE,
    error: "Failed to publish extension",
    actionName: "publish",
    zip: ""
  });
}

export async function deployToChrome(
  { extId, publisherId, refreshToken, zip }: ChromeOptions,
  logger?: StoreLogger,
  _onCookieExpired?: CookieRefreshCallback,
  verbose?: boolean
) {
  const authHeaders = { Authorization: `Bearer ${refreshToken}` };
  httpClient = createHttpClient(BASE_URL, authHeaders);
  uploadHttpClient = createHttpClient(BASE_URL, authHeaders);

  if (verbose) {
    logger?.info(`Uploading zip with extension ID ${extId}`);
  }

  await uploadZip({ zip,
    extId,
    publisherId });

  if (verbose) {
    logger?.info("Publishing extension");
  }

  await publishExtension({ extId,
    publisherId });

  logger?.info("Successfully published to Chrome Web Store!");
  return true;
}
