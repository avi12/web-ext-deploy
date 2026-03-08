import { createHttpClient } from "../../http/client.js";
import { StoreStatus, type DeployContext } from "../../types.js";
import { green, storeError } from "../../ui/logging.js";
import {
  createRateLimitHandler,
  requestWithRetry,
  type HttpLikeResponse,
  type RateLimitHandler
} from "../../utils/retry.js";
import { getExtJson } from "../../utils/zip.js";
import { EdgeOptionsPublishApi } from "./edge-input.js";
import { OperationStatus, PublishOperationStatusSchema, StatusPackageUploadSchema } from "./edge-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

class InProgressSubmissionError extends Error {
  constructor() {
    super("A submission is already in progress");
    this.name = "InProgressSubmissionError";
  }
}

let httpClient: ReturnType<typeof createHttpClient>;

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-status-of-a-package-upload */
async function checkStatusOfPackageUpload({
  productId,
  operationId,
  logger,
  onRateLimit
}: {
  productId: string;
  operationId: string;
  logger?: DeployContext["logger"];
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
      logger,
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
  logger,
  onRateLimit
}: {
  zip: string;
  productId: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.post(`products/${productId}/submissions/draft/package`, fs.createReadStream(zip), { headers: { "Content-Type": "application/zip" } }),
    parseResponse: parseLocation,
    formatError: storeError,
    errorContext: "Upload failed",
    logger,
    onRateLimit
  });
}

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#publish-the-product-draft-submission */
function publishSubmission({
  productId,
  devChangelog,
  logger,
  onRateLimit
}: {
  productId: string;
  devChangelog: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.post(`products/${productId}/submissions`, JSON.stringify({ notes: devChangelog }), { headers: { "Content-Type": "application/json" } }),
    parseResponse: parseLocation,
    formatError: storeError,
    errorContext: "Publish failed",
    logger,
    onRateLimit
  });
}

/** @see https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/addons-api-reference#check-the-publishing-status */
async function checkPublishStatus({
  productId,
  operationId,
  logger,
  onRateLimit
}: {
  productId: string;
  operationId: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const data = await requestWithRetry({
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
    logger,
    onRateLimit
  });

  if (!("status" in data)) {
    throw new Error(storeError(data.message));
  }
  if (data.status === OperationStatus.Failed) {
    if (data.errorCode === "InProgressSubmission") {
      throw new InProgressSubmissionError();
    }
    const errors = (data.errors || []).map(error => error.message);
    if (errors.length === 0) {
      errors.push(data.message);
    }
    throw new Error(storeError(errors.join("\n")));
  }
  return data;
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
    logger?.info(`Uploading zip of ${name} with product ID ${productId}`);
  }

  const uploadOperationId = await uploadZip({
    zip,
    productId,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  await checkStatusOfPackageUpload({
    productId,
    operationId: uploadOperationId,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Publishing submission");
  }

  async function publishAndVerify() {
    const publishOperationId = await publishSubmission({
      productId,
      devChangelog,
      logger,
      onRateLimit
    });

    if (isVerbose) {
      logger?.info("Checking the submission status");
    }

    await checkPublishStatus({
      productId,
      operationId: publishOperationId,
      logger,
      onRateLimit
    });
  }

  const inProgressRetryIntervalMs = 60_000;
  try {
    await publishAndVerify();
  } catch (error) {
    if (!(error instanceof InProgressSubmissionError)) {
      throw error;
    }
    await (logger?.countdown?.(inProgressRetryIntervalMs / 1000, remaining =>
      `A submission is already in progress. Retrying in ${remaining}s`
    ) ?? setTimeout(inProgressRetryIntervalMs));
    await publishAndVerify();
  }

  logger?.info(green("Successfully published to Edge Add-ons!"));
  setStatus?.(StoreStatus.Success);
  return true;
}
