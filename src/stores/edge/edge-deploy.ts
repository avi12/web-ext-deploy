import Axios, { AxiosInstance, AxiosResponse } from "axios";
import { backOff } from "exponential-backoff";
import { EdgeOptionsPublishApi } from "./edge-input.js";
import { getErrorMessage, getExtInfo, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE = "Edge";
const STATUS_ACCEPTED = 202;
let axios: AxiosInstance;

async function getUploadStatus({
  productID,
  operationID
}: {
  productID: string;
  operationID: string;
}): Promise<AxiosResponse> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#checking-the-status-of-a-package-upload
  return axios(`/products/${productID}/submissions/draft/package/operations/${operationID}`);
}

async function upload({
  zip,
  productId
}: {
  zip: string;
  productId: string;
}): Promise<{ location?: string; error?: string }> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#uploading-a-package-to-update-an-existing-submission
  return axios
    .post(`/products/${productId}/submissions/draft/package`, fs.readFileSync(zip), {
      headers: {
        "Content-Type": "application/zip"
      }
    })
    .then(({ headers }) => ({ location: headers.location }))
    .catch(e => ({
      error: getErrorMessage({
        store: STORE,
        zip,
        error: e.response.statusText,
        actionName: "upload"
      })
    }));
}

async function loopProgress({
  productId,
  location,
  zip
}: {
  productId: string;
  location: string;
  zip: string;
}): Promise<{ error?: string }> {
  let data;
  try {
    data = await backOff(() => getUploadStatus({
      productID: productId,
      operationID: location
    }));
  } catch (e) {
    return {
      error: getErrorMessage({ store: STORE, zip, error: e, actionName: "upload" })
    };
  }

  if (data.status === "Failed") {
    return {
      error: getErrorMessage({ store: STORE, zip, error: data.status, actionName: "upload" })
    };
  }
  return { error: "" };
}

async function publish({
  productId,
  devChangelog,
  zip
}: {
  productId: string;
  devChangelog: string;
  zip: string;
}): Promise<{ error: string; operationId: string }> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#publishing-the-submission
  return axios
    .post(`/products/${productId}/submissions`, { notes: devChangelog })
    .then(({ status, data, headers: { location } }) => ({
      error:
        status !== STATUS_ACCEPTED
          ? getErrorMessage({ store: STORE, zip, error: data.status, actionName: "publish" })
          : "",
      operationId: location
    }))
    .catch(e => ({
      error: getErrorMessage({ store: STORE, zip, error: e.response.data, actionName: "publish" }),
      operationId: ""
    }));
}

async function checkPublishStatus({
  productId,
  operationId,
  zip
}: {
  productId: string;
  operationId: string;
  zip: string;
}): Promise<{ error: string }> {
  // https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api#checking-the-status-of-a-package-upload
  return axios(`/products/${productId}/submissions/operations/${operationId}`).then(({ data }) => ({
    error:
      data.status === "Failed" ? getErrorMessage({ store: STORE, zip, error: data.message, actionName: "publish" }) : ""
  }));
}

export async function deployToEdgePublishApi({
  productId,
  clientId,
  apiKey,
  zip,
  verbose: isVerbose,
  devChangelog
}: EdgeOptionsPublishApi): Promise<true> {
  return new Promise(async (resolve, reject) => {
    axios = Axios.create({
      baseURL: "https://api.addons.microsoftedge.microsoft.com/v1",
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        "X-ClientID": clientId
      }
    });

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Updating ${getExtInfo(zip, "name")} with product ID ${productId}`
        })
      );
    }

    const { location, error: errorUpload } = await upload({
      zip,
      productId
    });
    if (errorUpload) {
      if (!errorUpload.includes("Invalid JWT")) {
        reject(errorUpload);
        return;
      }

      await deployToEdgePublishApi({
        productId,
        zip,
        verbose: isVerbose,
        devChangelog,
        apiKey,
        clientId
      });
      return;
    }

    const { error: errorProgress } = await loopProgress({
      productId,
      location,
      zip
    });
    if (errorProgress) {
      reject(errorProgress);
      return;
    }

    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Publishing ${getExtInfo(zip, "name")} version ${getExtInfo(zip, "version")}`
        })
      );
    }

    const { error: errorPublish, operationId } = await publish({
      productId,
      devChangelog,
      zip
    });

    if (errorPublish) {
      reject(getErrorMessage({ store: STORE, zip, error: errorPublish, actionName: "publish" }));
      return;
    }

    const { error: errorPublishStatus } = await checkPublishStatus({
      productId,
      operationId,
      zip
    });

    if (errorPublishStatus) {
      reject(errorPublishStatus);
      return;
    }

    logSuccessfullyPublished({ store: STORE, extId: productId, zip });
    resolve(true);
  });
}
