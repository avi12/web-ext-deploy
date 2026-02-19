import { z } from "zod";
import { EdgeOptionsPublishApi } from "./edge-input.js";
import { PublishOperationStatusSchema, StatusPackageUploadSchema, type StatusPackageUpload } from "./edge-types.js";
import { createHttpClient, type HttpResponse } from "../../http-client.js";
import type { CookieRefreshCallback, StoreLogger } from "../../types.js";
import { getErrorMessage, getExtJson } from "../../utils.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

const STORE = "Edge";
let httpClient: ReturnType<typeof createHttpClient>;
let logger: StoreLogger | undefined;

function handleError(e: unknown, errorActionOnFailure: string, zip: string, productId: string) {
  const err = e instanceof Object ? e : {};
  const status = "status" in err ? Number(err.status) : 0;
  const statusText = "statusText" in err && typeof err.statusText === "string" ? err.statusText : String(e);

  if (status === 429) {
    const responseData =
      "response" in err && err.response instanceof Object && "data" in err.response ? err.response.data : undefined;
    const message =
      responseData instanceof Object && "message" in responseData && typeof responseData.message === "string"
        ? responseData.message
        : "";
    const secondsToWait = Number(message.match(/\d+/)?.[0] || "60");
    if (secondsToWait >= 60) {
      const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
      logger?.warning(
        `Too many requests. A retry will automatically be at ${newTime}\nOr, you can deploy manually: https://partner.microsoft.com/en-us/dashboard/microsoftedge/${productId}/packages/dashboard`
      );
    }
    return undefined; // Signal to retry
  }

  return getErrorMessage({
    store: STORE,
    error: statusText,
    actionName: errorActionOnFailure,
    zip
  });
}

async function requestWithBackOff<T>({
  sendRequest,
  parseResponse,
  errorActionOnFailure,
  zip,
  productId
}: {
  sendRequest: () => Promise<HttpResponse<unknown>>;
  parseResponse: (response: HttpResponse<unknown>) => T;
  errorActionOnFailure: string;
  zip: string;
  productId: string;
}): Promise<[string] | [undefined, T]> {
  const maxRetries = 5;
  const maxBackOffMs = 30_000;
  const rateLimitRetryMs = 60_000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await sendRequest();
      return [undefined, parseResponse(response)];
    } catch (e: unknown) {
      const err = e instanceof Object ? e : {};
      const status = "status" in err ? Number(err.status) : 0;
      if (status >= 500 && attempt < maxRetries) {
        const exponentialDelay = Math.min(1000 * Math.pow(2, attempt - 1), maxBackOffMs);
        await setTimeout(exponentialDelay);
        continue;
      }

      const errorMsg = handleError(e, errorActionOnFailure, zip, productId);
      if (errorMsg === undefined) {
        await setTimeout(rateLimitRetryMs);
        continue;
      }
      return [errorMsg];
    }
  }

  return [
    getErrorMessage({ store: STORE,
      error: "Max retries exceeded",
      actionName: errorActionOnFailure,
      zip })
  ];
}

async function checkStatusOfPackageUpload({
  productId,
  operationId,
  zip
}: {
  productId: string;
  operationId: string;
  zip: string;
}) {
  const sendRequest = () =>
    httpClient.get(`products/${productId}/submissions/draft/package/operations/${operationId}`);
  let data: StatusPackageUpload;
  let error: string;
  do {
    [error, data] = await requestWithBackOff({
      sendRequest,
      parseResponse: r => StatusPackageUploadSchema.parse(r.data),
      errorActionOnFailure: "verify upload of",
      zip,
      productId
    });
    if (error) {
      return [error];
    }
  } while (data.status === "InProgress");
  if (data.status === "Failed") {
    const errors = (data.errors || []).map(({ message }) => message).join("\n");
    return [errors];
  }
  return [undefined, data];
}

function parseLocation(r: HttpResponse<unknown>) {
  return z.string().parse(r.headers?.location);
}

async function uploadZip({
  zip,
  productId
}: {
  zip: string;
  productId: string;
}) {
  const sendRequest = () =>
    httpClient.post(`products/${productId}/submissions/draft/package`, fs.createReadStream(zip), {
      headers: { "Content-Type": "application/zip" }
    });

  return requestWithBackOff({ sendRequest,
    parseResponse: parseLocation,
    errorActionOnFailure: "upload",
    zip,
    productId });
}

async function publishSubmission({
  zip,
  productId,
  devChangelog
}: {
  zip: string;
  productId: string;
  devChangelog: string;
}) {
  const sendRequest = () =>
    httpClient.post(`products/${productId}/submissions`, JSON.stringify({ notes: devChangelog }), {
      headers: { "Content-Type": "application/json" }
    });

  return requestWithBackOff({ sendRequest,
    parseResponse: parseLocation,
    errorActionOnFailure: "publish",
    zip,
    productId });
}

async function checkPublishStatus({
  zip,
  productId,
  operationId
}: {
  zip: string;
  productId: string;
  operationId: string;
}) {
  const sendRequest = () =>
    httpClient.get(`products/${productId}/submissions/operations/${operationId}`);

  const [error, data] = await requestWithBackOff({
    sendRequest,
    parseResponse: r => PublishOperationStatusSchema.parse(r.data),
    errorActionOnFailure: "check the submission status of",
    zip,
    productId
  });
  if (error) {
    return [error];
  }
  if (!data.status) {
    return [data.message];
  }
  if (data.status !== "Failed") {
    return [undefined, data];
  }

  const errors = (data.errors || []).map(err => err.message);
  if (errors.length === 0) {
    errors.push(data.message);
  }
  return [errors.join("\n")];
}

export async function deployToEdgePublishApi(
  { productId, clientId, apiKey, zip, devChangelog }: EdgeOptionsPublishApi,
  storeLogger?: StoreLogger,
  _onCookieExpired?: CookieRefreshCallback,
  verbose?: boolean
) {
  logger = storeLogger;

  httpClient = createHttpClient("https://api.addons.microsoftedge.microsoft.com/v1", {
    Authorization: `ApiKey ${apiKey}`,
    "X-ClientID": clientId
  });

  const { name } = await getExtJson(zip);

  if (verbose) {
    logger?.info(`Uploading zip of ${name} with product ID ${productId}`);
  }

  const [uploadError, uploadOperationId] = await uploadZip({ zip,
    productId });
  if (uploadError) {
    throw uploadError;
  }

  if (verbose) {
    logger?.info("Verifying upload");
  }

  const [verifyError] = await checkStatusOfPackageUpload({ zip,
    productId,
    operationId: uploadOperationId });
  if (verifyError) {
    throw verifyError;
  }

  if (verbose) {
    logger?.info("Publishing submission");
  }

  const [publishError, publishOperationId] = await publishSubmission({ zip,
    productId,
    devChangelog });
  if (publishError) {
    throw publishError;
  }

  if (verbose) {
    logger?.info("Checking the submission status");
  }

  const [statusError] = await checkPublishStatus({ zip,
    productId,
    operationId: publishOperationId });
  if (statusError) {
    throw statusError;
  }

  logger?.info("Successfully published to Edge Add-ons!");
  return true;
}
