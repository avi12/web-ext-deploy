import Axios, { type AxiosInstance, type AxiosResponse } from "axios";
import chalk from "chalk";
import { backOff } from "exponential-backoff";
import status from "http-status";
import { EdgeOptionsPublishApi } from "./edge-input.js";
import type { PublishOperationStatus, StatusPackageUpload } from "./edge-types.js";
import type { SupportedStoresCapitalized } from "../../types.js";
import { getErrorMessage, getExtJson, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE: SupportedStoresCapitalized = "Edge";
let axios: AxiosInstance;

async function handleRequestWithBackOff<T>({
  sendRequest,
  errorActionOnFailure,
  zip,
  productId,
  isGetLocation
}: {
  sendRequest: () => Promise<AxiosResponse<T>>;
  errorActionOnFailure: string;
  zip: string;
  productId: string;
  isGetLocation?: boolean;
}): Promise<[string] | [undefined, T]> {
  while (true) {
    try {
      const { data, headers } = await sendRequest();
      return [undefined, isGetLocation ? headers.location : data];
    } catch (e) {
      const isServerError = e.response.status >= 500;
      if (isServerError) {
        await backOff(Promise.resolve, { maxDelay: 30_000, delayFirstAttempt: true, jitter: "full" });
        continue;
      }

      if (e.response.status === status.TOO_MANY_REQUESTS) {
        const secondsToWait = Number(e.response.data.message.match(/\d+/)[0]);
        if (secondsToWait >= 60) {
          const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
          console.log(
            chalk.yellow(
              getVerboseMessage({
                store: STORE,
                message: `
Too many requests. A retry will automatically be at ${newTime}
Or, you can deploy manually: https://partner.microsoft.com/en-us/dashboard/microsoftedge/${productId}/packages/dashboard
             `.trim(),
                prefix: "Warning"
              })
            )
          );
        }
        await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
        continue;
      }

      // Some sort of client error
      return [
        getErrorMessage({
          store: STORE,
          error: e.response.statusText,
          actionName: errorActionOnFailure,
          zip
        })
      ];
    }
  }
}

async function checkStatusOfPackageUpload({
  productId,
  operationId,
  zip
}: {
  productId: string;
  operationId: string;
  zip: string;
}): Promise<[undefined, StatusPackageUpload] | [string]> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#checking-the-status-of-a-package-upload
  const sendRequest = () =>
    axios<StatusPackageUpload>(`/products/${productId}/submissions/draft/package/operations/${operationId}`);
  let data: StatusPackageUpload;
  let error: string;
  do {
    [error, data] = await handleRequestWithBackOff<StatusPackageUpload>({
      sendRequest,
      errorActionOnFailure: "verify upload of",
      zip,
      productId
    });
    if (error) {
      return [error];
    }
  } while (data.status === "InProgress");
  if (data.status === "Failed") {
    const errors = data.errors.map(({ message }) => message).join("\n");
    return [errors];
  }
  return [undefined, data];
}

async function uploadZip({
  zip,
  productId
}: {
  zip: string;
  productId: string;
}): Promise<[undefined, string] | [string]> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#uploading-a-package-to-update-an-existing-submission
  const sendRequest = () =>
    axios.post(`/products/${productId}/submissions/draft/package`, fs.createReadStream(zip), {
      headers: {
        "Content-Type": "application/zip"
      }
    });

  const [error, location] = await handleRequestWithBackOff<string>({
    sendRequest,
    errorActionOnFailure: "upload",
    zip,
    productId,
    isGetLocation: true
  });
  if (error) {
    return [error];
  }
  return [undefined, location];
}

async function publishSubmission({
  zip,
  productId,
  devChangelog
}: {
  zip: string;
  productId: string;
  devChangelog: string;
}): Promise<[undefined, string] | [string]> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#publishing-the-submission
  const sendRequest = () => axios.post(`/products/${productId}/submissions`, { notes: devChangelog });

  const [error, location] = await handleRequestWithBackOff<string>({
    sendRequest,
    errorActionOnFailure: "publish",
    productId,
    zip,
    isGetLocation: true
  });
  if (error) {
    return [error];
  }
  return [undefined, location];
}

async function checkPublishStatus({
  zip,
  productId,
  operationId
}: {
  zip: string;
  productId: string;
  operationId: string;
}): Promise<[undefined, PublishOperationStatus] | [string]> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#checking-the-status-of-a-package-upload
  const sendRequest = () =>
    axios<PublishOperationStatus>(`/products/${productId}/submissions/operations/${operationId}`);

  const [error, data] = await handleRequestWithBackOff<PublishOperationStatus>({
    sendRequest,
    errorActionOnFailure: "check the submission status of",
    zip,
    productId
  });
  if (error) {
    return [error];
  }
  if (!("status" in data)) {
    return [data.message];
  }
  if (data.status === "Failed") {
    const errors: Array<string> = [];
    for (const error of data.errors || []) {
      errors.push(error.message);
    }
    if (errors.length === 0) {
      errors.push(data.message);
    }
    return [errors.join("\n")];
  }
  return [undefined, data];
}

export async function deployToEdgePublishApi({
  productId,
  clientId,
  apiKey,
  zip,
  verbose: isVerbose,
  devChangelog
}: EdgeOptionsPublishApi) {
  axios = Axios.create({
    baseURL: "https://api.addons.microsoftedge.microsoft.com/v1",
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      "X-ClientID": clientId
    }
  });

  const { name } = getExtJson(zip);

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: `Uploading zip of ${name} with product ID ${productId}` }));
  }

  let [error, operationId] = await uploadZip({ zip, productId });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: `Verifying upload` }));
  }

  [error] = await checkStatusOfPackageUpload({ zip, productId, operationId });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: `Publishing submission` }));
  }

  [error, operationId] = await publishSubmission({ zip, productId, devChangelog });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: `Checking the submission status` }));
  }

  [error] = await checkPublishStatus({ zip, productId, operationId });
  if (error) {
    throw error;
  }

  logSuccessfullyPublished({ store: STORE, extId: productId, zip });
  return true;
}
