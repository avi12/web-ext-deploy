import Axios, { type AxiosInstance, type AxiosResponse } from "axios";
import chalk from "chalk";
import dedent from "dedent";
import { backOff } from "exponential-backoff";
import FormData from "form-data";
import status from "http-status";
import jwt from "jsonwebtoken";
import { FirefoxOptionsSubmissionApi } from "./firefox-input.js";
import type { FirefoxCreateNewVersion, FirefoxUploadDetail, FirefoxUploadSource } from "./firefox-types.js";
import type { SupportedStoresCapitalized } from "../../types.js";
import { getErrorMessage, getExtJson, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE: SupportedStoresCapitalized = "Firefox";
let axios: AxiosInstance;
const SECONDS_TO_TOKEN_EXPIRY = 60 * 3;

async function handleRequestWithBackOff<T>({
  sendRequest,
  errorActionOnFailure,
  zip,
  extId
}: {
  sendRequest: () => Promise<AxiosResponse<T>>;
  errorActionOnFailure: string;
  zip: string;
  extId: string;
}): Promise<[string] | [undefined, T]> {
  while (true) {
    try {
      const { data } = await sendRequest();
      return [undefined, data];
    } catch (e) {
      const isServerError = e.response.status >= 500;
      if (isServerError) {
        await backOff(Promise.resolve, { maxDelay: 30_000, delayFirstAttempt: true, jitter: "full" });
        continue;
      }

      if (e.response.status === status.TOO_MANY_REQUESTS) {
        const secondsToWait = Number(e.response.data.detail.match(/\d+/)[0]);
        if (secondsToWait <= 60) {
          if (secondsToWait < SECONDS_TO_TOKEN_EXPIRY) {
            const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
            console.log(
              chalk.yellow(
                getVerboseMessage({
                  store: STORE,
                  message: dedent(`
                    Too many requests. A retry will automatically be at ${newTime}
                    Or, you can deploy manually: https://addons.mozilla.org/developers/addon/${extId}/versions/submit/
                  `),
                  prefix: "Warning"
                })
              )
            );
          }
          await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
          continue;
        }
        // If the wait time is greater than SECONDS_TO_TOKEN_EXPIRY, do not retry due to the token expiry
        return [
          getErrorMessage({
            store: STORE,
            error: `Too many API requests. Deploy manually at https://addons.mozilla.org/developers/addons/${extId}/versions/submit/`,
            actionName: errorActionOnFailure,
            zip
          })
        ];
      }

      // Some sort of client error
      let errorMessage = getErrorMessage({
        store: STORE,
        error: JSON.stringify(e.response.data),
        actionName: errorActionOnFailure,
        zip
      });
      if (errorMessage.match(/release_notes.+The language code.+is invalid/)) {
        errorMessage += " Supported language codes: https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py";
      }
      return [
        errorMessage
      ];
    }
  }
}

function getJwtBlob({ jwtIssuer, jwtSecret }: { jwtIssuer: string; jwtSecret: string }): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: jwtIssuer,
    jti: Math.random().toString(),
    iat: issuedAt,
    exp: issuedAt + SECONDS_TO_TOKEN_EXPIRY
  };
  return jwt.sign(payload, jwtSecret, { algorithm: "HS256" });
}

async function uploadZip({
  zip,
  extId
}: {
  zip: string;
  extId: string;
}): Promise<[string] | [undefined, FirefoxUploadDetail]> {
  // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#upload-create
  const formData = new FormData();
  formData.append("upload", fs.createReadStream(zip));
  formData.append("channel", "listed");

  const sendRequest = () =>
    axios.post<FirefoxUploadDetail>("upload/", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

  const [error, data] = await handleRequestWithBackOff<FirefoxUploadDetail>({
    zip,
    sendRequest,
    errorActionOnFailure: "upload zip for",
    extId
  });
  if (error) {
    return [error];
  }
  return [undefined, data];
}

async function createNewVersion({
  slug,
  uuid,
  changelog,
  changelogLang,
  devChangelog,
  isVerbose,
  zip
}: {
  slug: string;
  uuid: string;
  changelog: string;
  changelogLang: string;
  devChangelog: string;
  isVerbose: boolean;
  zip: string;
}): Promise<[undefined, FirefoxCreateNewVersion] | [string]> {
  // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#version-create
  const { default_locale = changelogLang } = getExtJson(zip);
  const sendRequest = async () =>
    axios.post(`addon/${slug}/versions/`, {
      upload: uuid,
      ...(changelog && {
        release_notes: {
          [default_locale.replaceAll("_", "-")]: changelog
        }
      }),
      ...(devChangelog && {
        approval_notes: devChangelog
      })
    });

  if (isVerbose) {
    if (changelog) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Adding changelog: ${changelog}`
        })
      );
    }

    if (devChangelog) {
      console.log(
        getVerboseMessage({
          store: STORE,
          message: `Adding changelog for reviewers: ${devChangelog}`
        })
      );
    }
  }

  const [error, data] = await handleRequestWithBackOff<FirefoxCreateNewVersion>({
    zip,
    sendRequest,
    errorActionOnFailure: "create new version of",
    extId: slug
  });
  if (error) {
    return [error];
  }
  return [undefined, data];
}

async function validateUpload({
  zip,
  extId,
  uuid
}: {
  zip: string;
  extId: string;
  uuid: string;
}): Promise<[string] | [undefined, FirefoxUploadDetail]> {
  // https://mozilla.github.io/addons-server/topics/api/addons.html#upload-detail
  const sendRequest = () => axios<FirefoxUploadDetail>(`upload/${uuid}/`);

  let data: FirefoxUploadDetail;
  let error: string;
  do {
    [error, data] = await handleRequestWithBackOff<FirefoxUploadDetail>({
      zip,
      sendRequest,
      errorActionOnFailure: "verify upload of",
      extId
    });
    if (error) {
      return [error];
    }
  } while (!data.processed);

  const errors: Array<string> = [];
  for (const error of data.validation.messages || []) {
    if (error.type === "error") {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    return [errors.join("\n")];
  }

  return [undefined, data];
}

async function uploadSourceCodeIfNeeded({
  slug,
  zipSource,
  version,
  zip
}: {
  slug: string;
  zipSource: string;
  version: string;
  zip: string;
}): Promise<[undefined, FirefoxUploadSource] | [string]> {
  // https://addons-server.readthedocs.io/en/latest/topics/api/addons.html#version-sources
  const formData = new FormData();
  formData.append("source", fs.createReadStream(zipSource));
  const sendRequest = async () =>
    axios.patch<FirefoxUploadSource>(`addon/${slug}/versions/${version}/`, formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

  const [error, data] = await handleRequestWithBackOff<FirefoxUploadSource>({
    zip,
    sendRequest,
    errorActionOnFailure: "upload source code of",
    extId: slug
  });
  if (error) {
    return [error];
  }
  return [undefined, data];
}

export default async function deployToFirefox({
  extId,
  jwtIssuer,
  jwtSecret,
  zip,
  zipSource = "",
  changelog = "",
  changelogLang = "en-US",
  devChangelog = "",
  verbose: isVerbose
}: FirefoxOptionsSubmissionApi): Promise<boolean> {
  axios = Axios.create({
    baseURL: `https://addons.mozilla.org/api/v5/addons/`,
    headers: {
      Authorization: `JWT ${getJwtBlob({ jwtIssuer, jwtSecret })}`
    }
  });

  const { name } = getExtJson(zip);

  if (isVerbose) {
    console.log(
      getVerboseMessage({
        store: STORE,
        message: `Uploading zip of ${name} with extension ID ${extId}`
      })
    );
  }

  // eslint-disable-next-line prefer-const
  let [error, { uuid, version }] = await uploadZip({ zip, extId });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(
      getVerboseMessage({
        store: STORE,
        message: "Verifying upload"
      })
    );
  }

  [error] = await validateUpload({ zip, extId, uuid });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(
      getVerboseMessage({
        store: STORE,
        message: `Creating a new version: ${version}`
      })
    );
  }

  [error] = await createNewVersion({
    slug: extId,
    uuid,
    changelog,
    changelogLang,
    devChangelog,
    isVerbose,
    zip
  });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(
      getVerboseMessage({
        store: STORE,
        message: `Uploading source ZIP: ${zipSource}`
      })
    );
  }

  [error] = await uploadSourceCodeIfNeeded({
    slug: extId,
    zipSource,
    version,
    zip
  });
  if (error) {
    throw error;
  }

  logSuccessfullyPublished({ extId, store: STORE, zip });
  return true;
}
