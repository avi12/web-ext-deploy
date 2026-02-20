import { z } from "zod";
import { ChromeOptions } from "./chrome-input.js";
import { createHttpClient } from "../../http-client.js";
import type { DeployContext } from "../../types.js";
import { getErrorMessage } from "../../utils.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

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

const FetchStatusSchema = z.object({
  publishedItemRevisionStatus: z.string().optional(),
  submittedItemRevisionStatus: z.string().optional()
});

const PENDING_REVIEW_STATES = ["PENDING_REVIEW", "IN_REVIEW"];

async function fetchStatus({ extId, publisherId }: { extId: string; publisherId: string }) {
  const response = await httpClient.get(`v2/publishers/${publisherId}/items/${extId}:fetchStatus`);
  const result = FetchStatusSchema.safeParse(response.data);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

async function cancelSubmissionIfPending({
  extId,
  publisherId,
  logger,
  verbose
}: {
  extId: string;
  publisherId: string;
  logger?: DeployContext["logger"];
  verbose?: boolean;
}) {
  const status = await fetchStatus({ extId, publisherId });
  const submittedStatus = status.submittedItemRevisionStatus;
  if (!submittedStatus || !PENDING_REVIEW_STATES.includes(submittedStatus)) {
    return;
  }

  if (verbose) {
    logger?.info(`Canceling pending submission (status: ${submittedStatus})`);
  }

  await httpClient.post(`v2/publishers/${publisherId}/items/${extId}:cancelSubmission`);
  await setTimeout(60_000);
}

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

  const upload = UploadResponseSchema.safeParse(response.data);
  if (!upload.success) {
    throw upload.error;
  }
  const data = upload.data;
  if (data.state === "SUCCESS") {
    return;
  }
  const errors = data.itemError?.map(({ error_detail }) => error_detail) || ["Unknown upload error"];
  throw new Error(
    getErrorMessage({
      store: STORE,
      error: errors.join("\n"),
      actionName: "upload",
      zip
    })
  );
}

async function publishExtension({
  extId,
  publisherId,
  skipReview,
  deployPercentage
}: {
  extId: string;
  publisherId: string;
  skipReview?: boolean;
  deployPercentage?: number;
}) {
  const body = {
    ...skipReview && {
      skipReview: true
    },
    ...deployPercentage !== undefined && {
      deployPercentage
    }
  };

  const hasBody = Object.keys(body).length > 0;
  const response = await httpClient.post(
    `v2/publishers/${publisherId}/items/${extId}:publish`,
    hasBody ? JSON.stringify(body) : undefined,
    hasBody ? { headers: { "Content-Type": "application/json" } } : {}
  );

  const publish = PublishResponseSchema.safeParse(response.data);
  if (!publish.success) {
    throw publish.error;
  }
  const data = publish.data;
  if (data.state === "SUCCESS") {
    return;
  }
  throw new Error(
    getErrorMessage({
      store: STORE,
      error: "Failed to publish extension",
      actionName: "publish",
      zip: ""
    })
  );
}

export async function deployToChrome(
  { extId, publisherId, refreshToken, zip, skipReview, deployPercentage }: ChromeOptions,
  { logger, verbose }: DeployContext = {}
) {
  const authHeaders = { Authorization: `Bearer ${refreshToken}` };
  httpClient = createHttpClient(BASE_URL, authHeaders);
  uploadHttpClient = createHttpClient(BASE_URL, authHeaders);

  await cancelSubmissionIfPending({ extId, publisherId, logger, verbose });

  if (verbose) {
    logger?.info(`Uploading zip with extension ID ${extId}`);
  }

  await uploadZip({ zip,
    extId,
    publisherId });

  if (verbose) {
    logger?.info("Publishing extension");
  }

  await publishExtension({ extId, publisherId, skipReview, deployPercentage });

  logger?.info("Successfully published to Chrome Web Store!");
  return true;
}
