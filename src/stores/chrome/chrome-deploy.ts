import { ChromeOptions } from "./chrome-input.js";
import { FetchStatusSchema, ItemState, PublishResponseSchema, UploadResponseSchema, UploadState } from "./chrome-types.js";
import { createHttpClient } from "../../http-client.js";
import type { DeployContext } from "../../types.js";
import { getErrorMessage } from "../../utils.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

const STORE = "Chrome";
const BASE_URL = "https://chromewebstore.googleapis.com";

let httpClient: ReturnType<typeof createHttpClient>;
let uploadHttpClient: ReturnType<typeof createHttpClient>;

const PENDING_REVIEW_STATES: readonly string[] = [ItemState.PENDING_REVIEW, ItemState.STAGED];

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
  const submittedState = status.submittedItemRevisionStatus?.state;
  if (!submittedState || !PENDING_REVIEW_STATES.includes(submittedState)) {
    return;
  }

  if (verbose) {
    logger?.info(`Canceling pending submission (state: ${submittedState})`);
  }

  await httpClient.post(`v2/publishers/${publisherId}/items/${extId}:cancelSubmission`);
  await setTimeout(60_000);
}

async function waitForUpload({
  extId,
  publisherId,
  zip
}: {
  extId: string;
  publisherId: string;
  zip: string;
}) {
  const maxAttempts = 10;
  const pollIntervalMs = 10_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await setTimeout(pollIntervalMs);
    const status = await fetchStatus({ extId, publisherId });
    const uploadState = status.lastAsyncUploadState;
    if (uploadState === UploadState.SUCCEEDED) {
      return;
    }
    if (uploadState !== UploadState.IN_PROGRESS) {
      throw new Error(
        getErrorMessage({ store: STORE, error: `Upload failed with state: ${uploadState}`, actionName: "upload", zip })
      );
    }
  }

  throw new Error(
    getErrorMessage({ store: STORE, error: "Upload timed out (still IN_PROGRESS)", actionName: "upload", zip })
  );
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
  if (upload.data.uploadState === UploadState.SUCCEEDED) {
    return;
  }
  if (upload.data.uploadState === UploadState.IN_PROGRESS) {
    return waitForUpload({ extId, publisherId, zip });
  }
  throw new Error(
    getErrorMessage({
      store: STORE,
      error: `Upload failed with state: ${upload.data.uploadState}`,
      actionName: "upload",
      zip
    })
  );
}

const PUBLISH_SUCCESS_STATES: readonly string[] = [ItemState.PENDING_REVIEW, ItemState.STAGED, ItemState.PUBLISHED, ItemState.PUBLISHED_TO_TESTERS];

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
  const { state } = publish.data;
  if (!PUBLISH_SUCCESS_STATES.includes(state)) {
    throw new Error(
      getErrorMessage({
        store: STORE,
        error: `Publish failed with state: ${state}`,
        actionName: "publish",
        zip: ""
      })
    );
  }
}

async function verifySubmission({ extId, publisherId }: { extId: string; publisherId: string }) {
  const status = await fetchStatus({ extId, publisherId });
  const submittedState = status.submittedItemRevisionStatus?.state;
  const publishedState = status.publishedItemRevisionStatus?.state;

  if (publishedState === ItemState.PUBLISHED || publishedState === ItemState.PUBLISHED_TO_TESTERS) {
    return;
  }
  if (submittedState && PUBLISH_SUCCESS_STATES.includes(submittedState)) {
    return;
  }

  const state = submittedState || publishedState || "unknown";
  throw new Error(
    getErrorMessage({ store: STORE, error: `Submission verification failed (state: ${state})`, actionName: "verify submission of", zip: "" })
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

  if (verbose) {
    logger?.info("Verifying submission");
  }

  await verifySubmission({ extId, publisherId });

  logger?.info("Successfully published to Chrome Web Store!");
  return true;
}
