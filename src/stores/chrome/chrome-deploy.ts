import { createHttpClient } from "../../http/client.js";
import { type DeployContext, StoreStatus } from "../../types.js";
import { isObjectEmpty } from "../../utils/helpers.js";
import { createRateLimitHandler, type RateLimitHandler, requestWithRetry } from "../../utils/retry.js";
import { ChromeOptions, storeError } from "./chrome-input.js";
import {
  FetchStatusSchema,
  ItemState,
  PublishResponseSchema,
  UploadResponseSchema,
  UploadState
} from "./chrome-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

let httpClient: ReturnType<typeof createHttpClient>;

const PENDING_REVIEW_STATES: readonly string[] = [ItemState.PENDING_REVIEW, ItemState.STAGED];

function fetchStatus({
  extId,
  publisherId,
  logger,
  onRateLimit
}: {
  extId: string;
  publisherId: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.get(`v2/publishers/${publisherId}/items/${extId}:fetchStatus`),
    parseResponse(response) {
      const result = FetchStatusSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Fetch status failed",
    logger,
    onRateLimit
  });
}

async function cancelSubmissionIfPending({
  extId,
  publisherId,
  logger,
  isVerbose,
  onRateLimit
}: {
  extId: string;
  publisherId: string;
  logger?: DeployContext["logger"];
  isVerbose?: boolean;
  onRateLimit?: RateLimitHandler;
}) {
  const status = await fetchStatus({
    extId, publisherId, logger, onRateLimit
  });
  const submittedState = status.submittedItemRevisionStatus?.state;
  if (!submittedState || !PENDING_REVIEW_STATES.includes(submittedState)) {
    return;
  }

  if (isVerbose) {
    logger?.info(`Canceling pending submission (state: ${submittedState})`);
  }

  await requestWithRetry({
    sendRequest: () => httpClient.post(`v2/publishers/${publisherId}/items/${extId}:cancelSubmission`),
    parseResponse: (): undefined => undefined,
    formatError: storeError,
    errorContext: "Cancel submission failed",
    logger,
    onRateLimit
  });
  await setTimeout(60_000);
}

async function waitForUpload({
  extId,
  publisherId,
  logger,
  onRateLimit
}: {
  extId: string;
  publisherId: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const pollIntervalMs = 5_000;

  for (;;) {
    const data = await requestWithRetry({
      sendRequest: () => httpClient.get(`v2/publishers/${publisherId}/items/${extId}:fetchStatus`),
      parseResponse(response) {
        const result = FetchStatusSchema.safeParse(response.data);
        if (!result.success) {
          throw result.error;
        }
        return result.data;
      },
      formatError: storeError,
      errorContext: "Upload status check failed",
      logger,
      onRateLimit
    });

    const { lastAsyncUploadState } = data;
    if (lastAsyncUploadState === UploadState.SUCCEEDED) {
      return;
    }
    if (lastAsyncUploadState !== UploadState.IN_PROGRESS) {
      throw new Error(storeError(`Upload failed with state: ${lastAsyncUploadState}`));
    }
    await setTimeout(pollIntervalMs);
  }
}

async function uploadZip({
  zip,
  extId,
  publisherId,
  logger,
  onRateLimit
}: {
  zip: string;
  extId: string;
  publisherId: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const data = await requestWithRetry({
    sendRequest: () => httpClient.post(
      `upload/v2/publishers/${publisherId}/items/${extId}:upload`,
      fs.createReadStream(zip),
      { headers: { "Content-Type": "application/zip" } }
    ),
    parseResponse(response) {
      const result = UploadResponseSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Upload failed",
    logger,
    onRateLimit
  });

  if (data.uploadState === UploadState.SUCCEEDED) {
    return;
  }
  if (data.uploadState === UploadState.IN_PROGRESS) {
    return waitForUpload({
      extId, publisherId, logger, onRateLimit
    });
  }
  throw new Error(storeError(`Upload failed with state: ${data.uploadState}`));
}

const PUBLISH_SUCCESS_STATES: readonly string[] = [ItemState.PENDING_REVIEW, ItemState.STAGED, ItemState.PUBLISHED, ItemState.PUBLISHED_TO_TESTERS];

async function publishExtension({
  extId,
  publisherId,
  skipReview,
  deployPercentage,
  logger,
  onRateLimit
}: {
  extId: string;
  publisherId: string;
  skipReview?: boolean;
  deployPercentage?: number;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const body = {
    ...skipReview && { skipReview: true },
    ...deployPercentage !== undefined && { deployPercentage }
  };

  const hasBody = !isObjectEmpty(body);
  const data = await requestWithRetry({
    sendRequest: () => httpClient.post(
      `v2/publishers/${publisherId}/items/${extId}:publish`,
      hasBody ? JSON.stringify(body) : undefined,
      hasBody ? { headers: { "Content-Type": "application/json" } } : {}
    ),
    parseResponse(response) {
      const result = PublishResponseSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Publish failed",
    logger,
    onRateLimit
  });

  const { state } = data;
  if (!PUBLISH_SUCCESS_STATES.includes(state)) {
    throw new Error(storeError(`Publish failed with state: ${state}`));
  }
}

async function verifySubmission({
  extId,
  publisherId,
  logger,
  onRateLimit
}: {
  extId: string;
  publisherId: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const status = await fetchStatus({
    extId, publisherId, logger, onRateLimit
  });
  const submittedState = status.submittedItemRevisionStatus?.state;
  const publishedState = status.publishedItemRevisionStatus?.state;

  if (publishedState === ItemState.PUBLISHED || publishedState === ItemState.PUBLISHED_TO_TESTERS) {
    return;
  }
  if (submittedState && PUBLISH_SUCCESS_STATES.includes(submittedState)) {
    return;
  }

  const state = submittedState || publishedState || "unknown";
  throw new Error(storeError(`Submission verification failed (state: ${state})`));
}

export async function deployToChrome(
  {
    extId, publisherId, refreshToken, zip, skipReview, deployPercentage
  }: ChromeOptions,
  {
    logger, isVerbose, setStatus, setZipPath
  }: DeployContext = {}
) {
  setZipPath?.(zip);
  const authHeaders = { Authorization: `Bearer ${refreshToken}` };
  httpClient = createHttpClient("https://chromewebstore.googleapis.com", authHeaders);

  const onRateLimit = createRateLimitHandler({
    manualDeployUrl: `https://chrome.google.com/webstore/devconsole/${publisherId}/${extId}/edit/package`,
    formatError: storeError,
    logger
  });

  await cancelSubmissionIfPending({
    extId, publisherId, logger, isVerbose, onRateLimit
  });

  if (isVerbose) {
    logger?.info(`Uploading zip with extension ID ${extId}`);
  }

  await uploadZip({
    zip,
    extId,
    publisherId,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Publishing extension");
  }

  await publishExtension({
    extId, publisherId, skipReview, deployPercentage, logger, onRateLimit
  });

  if (isVerbose) {
    logger?.info("Verifying submission");
  }

  await verifySubmission({
    extId, publisherId, logger, onRateLimit
  });

  logger?.info("Successfully published to Chrome Web Store!");
  setStatus?.(StoreStatus.Success);
  return true;
}
