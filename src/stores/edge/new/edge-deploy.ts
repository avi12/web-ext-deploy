import { EdgeOptionsPublishApi } from "./edge-input";
import axios, { AxiosResponse } from "axios";
import fs from "fs";
import {
  getExtInfo,
  getVerboseMessage,
  logSuccessfullyPublished
} from "../../../utils";
import { getEdgePublishApiAccessToken } from "../../../get-edge-publish-api-access-token";

const store = "Edge";
const baseUrl = `https://api.addons.microsoftedge.microsoft.com/v1`;
const STATUS_ACCEPTED = 202;

function getBaseHeaders({
  accessToken,
}: {
  accessToken: string;
}): {
  Authorization: string;
} {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}

async function getUploadStatus({
  accessToken,
  productID,
  operationID
}: {
  accessToken: string;
  productID: string;
  operationID: string;
}): Promise<AxiosResponse> {
  return axios(
    `${baseUrl}/products/${productID}/submissions/draft/package/operations/${operationID}`,
    {
      headers: getBaseHeaders({ accessToken })
    }
  );
}

function getErrorMessage({
  zip,
  error,
  actionName
}: {
  zip: string;
  error: number | string;
  actionName: string;
}): string {
  return getVerboseMessage({
    store,
    prefix: "Error",
    message: `Failed to ${actionName} ${getExtInfo(zip, "name")}: ${error}`
  });
}

async function upload({
  accessToken,
  zip,
  productId
}: {
  accessToken: string;
  zip: string;
  productId: string;
}): Promise<{ location?: string; error?: string }> {
  return axios
    .post(
      `${baseUrl}/products/${productId}/submissions/draft/package`,
      fs.readFileSync(zip),
      {
        headers: {
          ...getBaseHeaders({ accessToken }),
          "Content-Type": "application/zip"
        }
      }
    )
    .then(({ headers }) => ({ location: headers.location }))
    .catch(e => ({
      error: getErrorMessage({
        zip,
        error: e.response.data.message,
        actionName: "upload"
      })
    }));
}

async function loopProgress({
  accessToken,
  productId,
  location,
  zip
}: {
  accessToken: string;
  productId: string;
  location: string;
  zip: string;
}): Promise<{ error?: string }> {
  let data;
  do {
    try {
      ({ data } = await getUploadStatus({
        accessToken,
        productID: productId,
        operationID: location
      }));
    } catch (e) {
      return {
        error: getErrorMessage({ zip, error: e, actionName: "upload" })
      };
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (data.status === "InProgress");

  if (data.status === "Failed") {
    return {
      error: getErrorMessage({ zip, error: data.status, actionName: "upload" })
    };
  }
  return { error: "" };
}

async function publish({
  accessToken,
  productId,
  devChangelog,
  zip
}: {
  accessToken: string;
  productId: string;
  devChangelog: string;
  zip: string;
}): Promise<{ error: string; operationId: string }> {
  return axios
    .post(
      `${baseUrl}/products/${productId}/submissions`,
      {
        notes: devChangelog
      },
      {
        headers: getBaseHeaders({ accessToken })
      }
    )
    .then(({ status, data, headers: { location } }) => ({
      error:
        status !== STATUS_ACCEPTED
          ? getErrorMessage({ zip, error: data.status, actionName: "publish" })
          : "",
      operationId: location
    }))
    .catch(e => ({
      error: getErrorMessage({
        zip,
        error: e.response.data,
        actionName: "publish"
      }),
      operationId: ""
    }));
}

async function checkPublishStatus({
  accessToken,
  productId,
  operationId,
  zip
}: {
  accessToken: string;
  productId: string;
  operationId: string;
  zip: string;
}): Promise<{ error: string }> {
  return axios
    .get(
      `${baseUrl}/products/${productId}/submissions/operations/${operationId}`,
      {
        headers: getBaseHeaders({ accessToken })
      }
    )
    .then(({ data }) => ({
      error:
        data.status === "Failed"
          ? getErrorMessage({
              zip,
              error: data.message,
              actionName: "publish"
            })
          : ""
    }));
}

export async function deployToEdgePublishApi({
  productId,
  clientId,
  clientSecret,
  accessTokenUrl,
  accessToken,
  zip,
  verbose,
  devChangelog
}: EdgeOptionsPublishApi): Promise<true> {
  return new Promise(async (resolve, reject) => {
    if (verbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Updating ${getExtInfo(
            zip,
            "name"
          )} with product ID ${productId} `
        })
      );
    }

    const { location, error: errorUpload } = await upload({
      accessToken,
      zip,
      productId
    });
    if (errorUpload) {
      if (errorUpload.includes("Invalid JWT")) {
        const { accessToken } = await getEdgePublishApiAccessToken({
          clientId,
          clientSecret,
          accessTokenUrl
        });
        await deployToEdgePublishApi({
          productId,
          zip,
          verbose,
          devChangelog,
          accessToken,
          accessTokenUrl,
          clientSecret,
          clientId
        });
      } else {
        reject(errorUpload);
      }
      return;
    }

    const { error: errorProgress } = await loopProgress({
      accessToken,
      productId,
      location,
      zip
    });
    if (errorProgress) {
      reject(errorProgress);
      return;
    }

    if (verbose) {
      console.log(
        getVerboseMessage({
          store,
          message: `Publishing ${getExtInfo(zip, "name")} version ${getExtInfo(
            zip,
            "version"
          )}`
        })
      );
    }

    const { error: errorPublish, operationId } = await publish({
      accessToken,
      productId,
      devChangelog,
      zip
    });

    if (errorPublish) {
      reject(
        getErrorMessage({ zip, error: errorPublish, actionName: "publish" })
      );
      return;
    }

    const { error: errorPublishStatus } = await checkPublishStatus({
      accessToken,
      productId,
      operationId,
      zip
    });

    if (errorPublishStatus) {
      reject(errorPublishStatus);
      return;
    }

    logSuccessfullyPublished({ store, extId: productId, zip });
    resolve(true);
  });
}
