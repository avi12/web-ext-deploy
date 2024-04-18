import Axios, { AxiosInstance, AxiosResponse } from "axios";
import FormData from "form-data";
import jwt from "jsonwebtoken";
import { FirefoxOptionsSubmissionApi } from "./firefox-input.js";
import { FirefoxCreateNewVersion, FirefoxUploadDetail, FirefoxUploadSource } from "../../types.js";
import { getErrorMessage, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE = "Firefox";
let axios: AxiosInstance;

function getJwtBlob({ jwtIssuer, jwtSecret }: { jwtIssuer: string; jwtSecret: string }): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: jwtIssuer,
    jti: Math.random().toString(),
    iat: issuedAt,
    exp: issuedAt + 60
  };
  return jwt.sign(payload, jwtSecret, { algorithm: "HS256" });
}

function getFormData({ zip }: { zip: string }): FormData {
  const formData = new FormData();
  formData.append("upload", fs.createReadStream(zip));
  formData.append("channel", "listed");
  return formData;
}

async function uploadZip({ zip }: { zip: string }): Promise<{
  uuid: string;
  version: string;
}> {
  // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#upload-create
  const {
    data: { uuid, version }
  } = await axios.post<FirefoxUploadDetail>(`upload/`, getFormData({ zip }), {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return { uuid, version };
}

async function createNewVersion({
  slug,
  uuid,
  changelog,
  devChangelog,
  isVerbose
}: {
  slug: string;
  uuid: string;
  changelog: string;
  devChangelog: string;
  isVerbose: boolean;
}): Promise<AxiosResponse<FirefoxCreateNewVersion>> {
  // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#version-create
  const objChangelogs: {
    release_notes?: { "en-US": string };
    approval_notes?: string;
  } = {};

  if (changelog) {
    objChangelogs.release_notes = {
      "en-US": changelog
    };
    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Adding changelog: ${changelog}`
        })
      );
    }
  }

  if (devChangelog) {
    objChangelogs.approval_notes = devChangelog;
    if (isVerbose) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Adding changelog for reviewers: ${devChangelog}`
        })
      );
    }
  }

  return axios.post(`addon/${slug}/versions/`, {
    upload: uuid,
    ...objChangelogs
  });
}

async function validateUpload({ uuid }: { uuid: string }): Promise<FirefoxUploadDetail> {
  return new Promise((resolve, reject) => {
    // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#upload-detail
    let delayInSeconds = 1;
    const maxDelayInSeconds = 60;
    let timeout: ReturnType<typeof setTimeout>;

    function clearTimer(): void {
      clearTimeout(timeout);
    }

    async function retry(): Promise<void> {
      axios(`upload/${uuid}/`)
        .then(({ data }: { data: FirefoxUploadDetail }) => {
          if (!data.processed) {
            return false;
          }
          clearTimer();
          if (data.valid) {
            resolve(data);
            return true;
          }

          const errors = data.validation.messages.filter(({ type }) => type === "error").map(({ message }) => message);
          reject({
            response: {
              data: {
                error: errors.length === 1 ? errors[0] : "\n" + errors.join("\n")
              }
            }
          });
          return true;
        })
        .then(isProcessed => {
          if (isProcessed) {
            clearTimer();
            return;
          }
          if (delayInSeconds < maxDelayInSeconds) {
            delayInSeconds *= 2;
          }
          clearTimer();
          timeout = setTimeout(retry, delayInSeconds * 1000);
        })
        .catch(reject);
    }

    retry();
  });
}

async function uploadSourceCodeIfNeeded({
  slug,
  zipSource,
  version
}: {
  slug: string;
  zipSource: string;
  version: string;
}): Promise<AxiosResponse<FirefoxUploadSource>> {
  // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#version-sources
  const formData = new FormData();
  formData.append("source", fs.createReadStream(zipSource));
  return axios.patch<FirefoxUploadSource>(`addon/${slug}/versions/${version}/`, formData, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
}

export default async function deployToFirefox({
  extId,
  jwtIssuer,
  jwtSecret,
  zip,
  zipSource = "",
  changelog = "",
  devChangelog = "",
  verbose: isVerbose
}: FirefoxOptionsSubmissionApi): Promise<boolean> {
  return new Promise(async (resolve, reject) => {
    axios = Axios.create({
      baseURL: `https://addons.mozilla.org/api/v5/addons/`,
      headers: {
        Authorization: `JWT ${getJwtBlob({ jwtIssuer, jwtSecret })}`
      }
    });

    try {
      const { uuid, version } = await uploadZip({ zip });

      await validateUpload({ uuid });

      if (isVerbose) {
        console.log(
          getVerboseMessage({
            store: STORE,
            message: `Uploaded ZIP: ${zip}`
          })
        );
      }

      await createNewVersion({
        slug: extId,
        uuid,
        changelog,
        devChangelog,
        isVerbose
      });

      if (isVerbose) {
        console.log(
          getVerboseMessage({
            store: STORE,
            message: `Creating a new version: ${version}`
          })
        );
      }

      await uploadSourceCodeIfNeeded({
        slug: extId,
        zipSource,
        version
      });

      if (isVerbose) {
        console.log(
          getVerboseMessage({
            store: STORE,
            message: `Uploaded source ZIP: ${zipSource}`
          })
        );
      }
    } catch ({ response: { data } }) {
      const error = Object.values(data).join(" ");
      const timeErrorMessage = (): string => {
        const secondsTotal = Number(error.match(/\d+/)[0]);
        const dateNext = new Date(Date.now() + secondsTotal * 1000);
        const timeNext = dateNext.toLocaleTimeString();
        return `${error} You can upload again at ${timeNext}.
Or, you can deploy manually: https://addons.mozilla.org/developers/addon/${extId}/versions/submit/`;
      };
      reject(
        getErrorMessage({
          store: STORE,
          zip,
          error: error.includes("Request was throttled") ? timeErrorMessage() : error,
          actionName: "proceed to update"
        })
      );
      return;
    }

    logSuccessfullyPublished({ extId, store: STORE, zip });

    resolve(true);
  });
}
