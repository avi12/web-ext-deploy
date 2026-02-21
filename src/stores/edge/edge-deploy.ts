import { createHttpClient } from "../../http-client.js";
import type { DeployContext } from "../../types.js";
import { getExtJson, requestWithRetry, type HttpLikeResponse } from "../../utils.js";
import { EdgeOptionsPublishApi, storeError } from "./edge-input.js";
import { PublishOperationStatusSchema, StatusPackageUploadSchema } from "./edge-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

let httpClient: ReturnType<typeof createHttpClient>;

function handleEdgeRateLimit (productId: string, logger?: DeployContext["logger"]) {
  return async (response: HttpLikeResponse) => {
    const message = z.object({ message: z.string() }).safeParse(response.data).data?.message ?? "";
    const secondsToWait = Number(message.match(/\d+/)?.[0] || "60");
    if (secondsToWait >= 60) {
      const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
      logger?.warning(
        `Too many requests. A retry will automatically be at ${newTime}\nOr, you can deploy manually: https://partner.microsoft.com/en-us/dashboard/microsoftedge/${productId}/packages/dashboard`
      );
    }
    await setTimeout(60_000);
  };
}

async function checkStatusOfPackageUpload ({
  productId,
  operationId,
  logger
}: {
  productId: string;
  operationId: string;
  logger?: DeployContext["logger"];
}) {
  const pollIntervalMs = 5_000;

  for (;;) {
    const data = await requestWithRetry({
      sendRequest: () => httpClient.get(`products/${productId}/submissions/draft/package/operations/${operationId}`),
      parseResponse (response) {
        const result = StatusPackageUploadSchema.safeParse(response.data);
        if (!result.success) {
          throw result.error;
        }
        return result.data;
      },
      formatError: storeError,
      errorContext: "Upload verification failed",
      logger
    });

    if (data.status === "Failed") {
      const errors = (data.errors || []).map(({ message }) => message).join("\n");
      throw new Error(storeError(errors));
    }
    if (data.status !== "InProgress") {
      return data;
    }
    await setTimeout(pollIntervalMs);
  }
}

function parseLocation (response: HttpLikeResponse) {
  const result = z.string().safeParse(response.headers?.location);
  if (!result.success) {
    throw new Error("Missing or invalid location header");
  }
  return result.data;
}

function uploadZip ({
  zip,
  productId,
  logger
}: {
  zip: string;
  productId: string;
  logger?: DeployContext["logger"];
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.post(`products/${productId}/submissions/draft/package`, fs.createReadStream(zip), { headers: { "Content-Type": "application/zip" } }),
    parseResponse: parseLocation,
    formatError: storeError,
    errorContext: "Upload failed",
    logger,
    onRateLimit: handleEdgeRateLimit(productId, logger)
  });
}

function publishSubmission ({
  productId,
  devChangelog,
  logger
}: {
  productId: string;
  devChangelog: string;
  logger?: DeployContext["logger"];
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.post(`products/${productId}/submissions`, JSON.stringify({ notes: devChangelog }), { headers: { "Content-Type": "application/json" } }),
    parseResponse: parseLocation,
    formatError: storeError,
    errorContext: "Publish failed",
    logger,
    onRateLimit: handleEdgeRateLimit(productId, logger)
  });
}

async function checkPublishStatus ({
  productId,
  operationId,
  logger
}: {
  productId: string;
  operationId: string;
  logger?: DeployContext["logger"];
}) {
  const data = await requestWithRetry({
    sendRequest: () => httpClient.get(`products/${productId}/submissions/operations/${operationId}`),
    parseResponse (response) {
      const result = PublishOperationStatusSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Submission status check failed",
    logger,
    onRateLimit: handleEdgeRateLimit(productId, logger)
  });

  if (!data.status) {
    throw new Error(storeError(data.message));
  }
  if (data.status === "Failed") {
    const errors = (data.errors || []).map(err => err.message);
    if (errors.length === 0) {
      errors.push(data.message);
    }
    throw new Error(storeError(errors.join("\n")));
  }
  return data;
}

export async function deployToEdgePublishApi (
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

  setZipPath?.(zip);
  const { name } = await getExtJson(zip);

  if (isVerbose) {
    logger?.info(`Uploading zip of ${name} with product ID ${productId}`);
  }

  const uploadOperationId = await uploadZip({
    zip,
    productId,
    logger
  });

  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  await checkStatusOfPackageUpload({
    productId,
    operationId: uploadOperationId,
    logger
  });

  if (isVerbose) {
    logger?.info("Publishing submission");
  }

  const publishOperationId = await publishSubmission({
    productId,
    devChangelog,
    logger
  });

  if (isVerbose) {
    logger?.info("Checking the submission status");
  }

  await checkPublishStatus({
    productId,
    operationId: publishOperationId,
    logger
  });

  logger?.info("Successfully published to Edge Add-ons!");
  setStatus?.("success");
  return true;
}
