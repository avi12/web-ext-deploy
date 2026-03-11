import { createHttpClient } from "../../http/client.js";
import { type DeployContext, StoreStatus } from "../../types.js";
import { storeError } from "../../ui/logging.js";
import {
  createRateLimitHandler,
  getBackoffDelayMs,
  type HttpLikeResponse,
  type RateLimitHandler,
  requestWithRetry
} from "../../utils/retry.js";
import { getExtJson } from "../../utils/zip.js";
import { EdgeOptionsPublishApi } from "./edge-input.js";
import { OperationStatus, PublishOperationStatusSchema, StatusPackageUploadSchema } from "./edge-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

let httpClient: ReturnType<typeof createHttpClient>;

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-status-of-a-package-upload */
async function checkStatusOfPackageUpload({
  productId,
  operationId,
  onRateLimit
}: {
  productId: string;
  operationId: string;
  onRateLimit?: RateLimitHandler;
}) {
  const pollIntervalMs = 5_000;
  let data: z.infer<typeof StatusPackageUploadSchema>;

  while (true) {
    data = await requestWithRetry({
      sendRequest: () => httpClient.get(`products/${productId}/submissions/draft/package/operations/${operationId}`),
      parseResponse(response) {
        const result = StatusPackageUploadSchema.safeParse(response.data);
        if (!result.success) {
          throw result.error;
        }

        return result.data;
      },
      formatError: storeError,
      errorContext: "Upload verification failed",
      onRateLimit
    });

    if (data.status !== OperationStatus.InProgress) {
      break;
    }

    await setTimeout(pollIntervalMs);
  }

  if (data.status === OperationStatus.Failed) {
    const errors = (data.errors || []).join("\n");
    throw new Error(storeError(errors));
  }

  return data;
}

function parseLocation(response: HttpLikeResponse) {
  const result = z.string().safeParse(response.headers?.location);
  if (!result.success) {
    throw new Error("Missing or invalid location header");
  }

  return result.data;
}

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#upload-a-package-to-update-an-existing-submission */
function uploadZip({
  zip,
  productId,
  onRateLimit
}: {
  zip: string;
  productId: string;
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.post(`products/${productId}/submissions/draft/package`, fs.createReadStream(zip), { headers: { "Content-Type": "application/zip" } }),
    parseResponse: parseLocation,
    formatError: storeError,
    errorContext: "Upload failed",
    onRateLimit
  });
}

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#publish-the-product-draft-submission */
function publishSubmission({
  productId,
  devChangelog,
  onRateLimit
}: {
  productId: string;
  devChangelog: string;
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.post(`products/${productId}/submissions`, JSON.stringify({ notes: devChangelog }), { headers: { "Content-Type": "application/json" } }),
    parseResponse: parseLocation,
    formatError: storeError,
    errorContext: "Publish failed",
    onRateLimit
  });
}

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-publishing-status */
function fetchPublishStatus({
  productId,
  operationId,
  onRateLimit
}: {
  productId: string;
  operationId: string;
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.get(`products/${productId}/submissions/operations/${operationId}`),
    parseResponse(response) {
      const result = PublishOperationStatusSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }

      return result.data;
    },
    formatError: storeError,
    errorContext: "Submission status check failed",
    onRateLimit
  });
}

async function checkPublishStatus({
  productId,
  operationId,
  onRateLimit
}: {
  productId: string;
  operationId: string;
  onRateLimit?: RateLimitHandler;
}) {
  const data = await fetchPublishStatus({ productId, operationId, onRateLimit });
  if (!("status" in data)) {
    throw new Error(storeError(data.message ?? "Unknown error"));
  }

  if (data.status === OperationStatus.Failed) {
    const errors = (data.errors || []).map(error => error.message);
    if (errors.length === 0) {
      errors.push(data.message ?? "Submission failed");
    }

    throw new Error(storeError(errors.join("\n")));
  }

  return data;
}

async function pollPublishStatus({
  productId,
  operationId,
  onRateLimit
}: {
  productId: string;
  operationId: string;
  onRateLimit?: RateLimitHandler;
}) {
  let attempt = 0;

  while (true) {
    const data = await checkPublishStatus({ productId, operationId, onRateLimit });
    if (data.status === OperationStatus.Succeeded) {
      return;
    }

    await setTimeout(getBackoffDelayMs(attempt++, 5_000));
  }
}

async function detectInProgressSubmission({
  productId,
  devChangelog,
  onRateLimit
}: {
  productId: string;
  devChangelog: string;
  onRateLimit?: RateLimitHandler;
}) {
  const operationId = await publishSubmission({ productId, devChangelog, onRateLimit });
  let attempt = 0;

  while (true) {
    const data = await fetchPublishStatus({ productId, operationId, onRateLimit });
    if (!("status" in data)) {
      return false;
    }

    if (data.status === OperationStatus.InProgress) {
      await setTimeout(getBackoffDelayMs(attempt++, 5_000));
      continue;
    }

    return data.status === OperationStatus.Failed && data.errorCode === "InProgressSubmission";
  }
}

export async function deployToEdgePublishApi(
  {
    productId, clientId, apiKey, zip, devChangelog
  }: EdgeOptionsPublishApi,
  {
    logger, isVerbose, setStatus, setZipPath
  }: DeployContext = {}
) {
  httpClient = createHttpClient("https://api.addons.microsoftedge.microsoft.com/v1", {
    Authorization: `ApiKey ${apiKey}`,
    "X-ClientID": clientId
  });

  const onRateLimit = createRateLimitHandler({
    manualDeployUrl: `https://partner.microsoft.com/en-us/dashboard/microsoftedge/${productId}/packages/dashboard`,
    formatError: storeError,
    getWaitSeconds(response) {
      const message = z.object({ message: z.string() }).safeParse(response.data).data?.message ?? "";
      return Number(message.match(/\d+/)?.[0] || "60");
    },
    logger
  });

  setZipPath?.(zip);
  const { name } = await getExtJson(zip);
  if (isVerbose) {
    logger?.info("Checking for in-progress submission");
  }

  const inProgress = await detectInProgressSubmission({ productId, devChangelog, onRateLimit });
  if (isVerbose) {
    logger?.info(inProgress
      ? `Submission in progress. Replacing draft of ${name}`
      : `Uploading zip of ${name} with product ID ${productId}`
    );
  }

  const uploadOperationId = await uploadZip({ zip, productId, onRateLimit });
  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  await checkStatusOfPackageUpload({ productId, operationId: uploadOperationId, onRateLimit });

  if (isVerbose) {
    logger?.info("Publishing submission");
  }

  const publishOperationId = await publishSubmission({ productId, devChangelog, onRateLimit });
  if (isVerbose) {
    logger?.info("Checking submission status");
  }

  await pollPublishStatus({ productId, operationId: publishOperationId, onRateLimit });

  setStatus?.(StoreStatus.Success);
  return true;
}
