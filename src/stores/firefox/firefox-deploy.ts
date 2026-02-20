import { z } from "zod";
import { FirefoxOptionsSubmissionApi } from "./firefox-input.js";
import {
  FirefoxUploadDetailSchema,
  FirefoxCreateNewVersionSchema,
  FirefoxUploadSourceSchema,
  type FirefoxUploadDetail
} from "./firefox-types.js";
import { FormData } from "../../form-data.js";
import { createHttpClient, type HttpResponse } from "../../http-client.js";
import { generateJwt } from "../../jwt.js";
import type { CookieRefreshCallback, StoreLogger } from "../../types.js";
import { getErrorMessage, getExtJson, toError } from "../../utils.js";
import fs from "node:fs";

const STORE = "Firefox";
let httpClient: ReturnType<typeof createHttpClient>;
const SECONDS_TO_TOKEN_EXPIRY = 60 * 3;

async function handleRequestWithBackOff<T>({
  sendRequest,
  parseResponse,
  errorActionOnFailure,
  zip,
  extId
}: {
  sendRequest: () => Promise<HttpResponse<unknown>>;
  parseResponse: (data: unknown) => T;
  errorActionOnFailure: string;
  zip: string;
  extId: string;
}): Promise<readonly [string] | readonly [undefined, T]> {
  const maxRetries = 5;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await sendRequest();
      return [undefined, parseResponse(response.data)] as const;
    } catch (error: unknown) {
      lastError = toError(error);
      const err = error instanceof Object ? error : {};
      const status = "status" in err ? Number(err.status) : 0;

      if (status >= 500 && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 30_000)));
        continue;
      }

      if (status === 429) {
        const errData = "data" in err ? err.data : undefined;
        const detail =
          errData instanceof Object && "detail" in errData && typeof errData.detail === "string"
            ? errData.detail
            : "";
        const secondsToWait = Number(detail.match(/\d+/)?.[0] || "60");
        if (secondsToWait > 60) {
          return [
            getErrorMessage({
              store: STORE,
              error: `Too many API requests. Deploy manually at https://addons.mozilla.org/developers/addons/${extId}/versions/submit/`,
              actionName: errorActionOnFailure,
              zip
            })
          ] as const;
        }
        if (secondsToWait < SECONDS_TO_TOKEN_EXPIRY) {
          const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
          logger?.warning(
            `Too many requests. A retry will automatically be at ${newTime}\nOr, you can deploy manually: https://addons.mozilla.org/developers/addon/${extId}/versions/submit/`
          );
        }
        await new Promise(resolve => setTimeout(resolve, secondsToWait * 1000));
        continue;
      }

      const errData = "data" in err ? err.data : undefined;
      let errorMessage = getErrorMessage({
        store: STORE,
        error: z.string().safeParse(errData).data ?? JSON.stringify(errData),
        actionName: errorActionOnFailure,
        zip
      });
      if (errorMessage.match(/release_notes.+The language code.+is invalid/)) {
        errorMessage +=
          " Supported language codes: https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py";
      }
      return [errorMessage] as const;
    }
  }

  throw lastError;
}

let jwtIssuer: string;
let jwtSecret: string;
let logger: StoreLogger | undefined;

async function uploadZip({
  zip,
  extId
}: {
  zip: string;
  extId: string;
}) {
  const formData = new FormData();
  formData.append("upload", fs.createReadStream(zip));
  formData.append("channel", "listed");

  const sendRequest = () =>
    httpClient.post("upload/", formData.getBody(), {
      headers: {
        ...formData.getHeaders(),
        Authorization: `JWT ${generateJwt({ jwtIssuer,
          jwtSecret })}`
      }
    });

  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: data => {
      const result = FirefoxUploadDetailSchema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorActionOnFailure: "upload zip for",
    extId
  });
}

async function createNewVersion({
  slug,
  uuid,
  changelog,
  changelogLang,
  devChangelog,
  zip
}: {
  slug: string;
  uuid: string;
  changelog: string;
  changelogLang: string;
  devChangelog: string;
  zip: string;
}) {
  const { default_locale = changelogLang } = await getExtJson(zip);
  const sendRequest = async () =>
    httpClient.post(
      `addon/${slug}/versions/`,
      JSON.stringify({
        upload: uuid,
        ...(changelog && {
          release_notes: {
            [default_locale.replaceAll("_", "-")]: changelog
          }
        }),
        ...(devChangelog && {
          approval_notes: devChangelog
        })
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  if (changelog) {
    logger?.info(`Adding changelog: ${changelog}`);
  }

  if (devChangelog) {
    logger?.info(`Adding changelog for reviewers: ${devChangelog}`);
  }

  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: data => {
      const result = FirefoxCreateNewVersionSchema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorActionOnFailure: "create new version of",
    extId: slug
  });
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
  let data: FirefoxUploadDetail;
  let error: string;

  do {
    const sendRequest = () => httpClient.get(`upload/${uuid}/`);
    [error, data] = await handleRequestWithBackOff({
      zip,
      sendRequest,
      parseResponse: response => {
        const result = FirefoxUploadDetailSchema.safeParse(response);
        if (!result.success) {
          throw result.error;
        }
        return result.data;
      },
      errorActionOnFailure: "verify upload of",
      extId
    });
    if (error) {
      return [error];
    }
  } while (!data.processed);

  const errors: Array<string> = [];
  for (const message of data.validation.messages || []) {
    if (message.type === "error") {
      errors.push(message.message);
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
}) {
  const formData = new FormData();
  formData.append("source", fs.createReadStream(zipSource));

  const sendRequest = async () =>
    httpClient.patch(`addon/${slug}/versions/${version}/`, formData.getBody(), {
      headers: formData.getHeaders()
    });

  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: data => {
      const result = FirefoxUploadSourceSchema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorActionOnFailure: "upload source code of",
    extId: slug
  });
}

export default async function deployToFirefox(
  {
    extId,
    jwtIssuer: issuer,
    jwtSecret: secret,
    zip,
    zipSource = "",
    changelog = "",
    changelogLang = "en-US",
    devChangelog = ""
  }: FirefoxOptionsSubmissionApi,
  storeLogger?: StoreLogger,
  _onCookieExpired?: CookieRefreshCallback,
  verbose?: boolean
) {
  jwtIssuer = issuer;
  jwtSecret = secret;
  logger = storeLogger;

  httpClient = createHttpClient("https://addons.mozilla.org/api/v5/addons/", {
    Authorization: `JWT ${generateJwt({ jwtIssuer,
      jwtSecret })}`
  });

  const { name } = await getExtJson(zip);

  if (verbose) {
    logger?.info(`Uploading zip of ${name} with extension ID ${extId}`);
  }

  const [uploadError, uploadData] = await uploadZip({ zip,
    extId });
  if (uploadError) {
    throw new Error(uploadError);
  }
  const { uuid, version } = uploadData;

  if (verbose) {
    logger?.info("Verifying upload");
  }

  const [validateError] = await validateUpload({ zip,
    extId,
    uuid });
  if (validateError) {
    throw new Error(validateError);
  }

  if (verbose) {
    logger?.info(`Creating a new version: ${version}`);
  }

  const [versionError] = await createNewVersion({
    slug: extId,
    uuid,
    changelog,
    changelogLang,
    devChangelog,
    zip
  });
  if (versionError) {
    throw new Error(versionError);
  }

  if (zipSource) {
    if (verbose) {
      logger?.info(`Uploading source ZIP: ${zipSource}`);
    }
    const [sourceError] = await uploadSourceCodeIfNeeded({
      slug: extId,
      zipSource,
      version,
      zip
    });
    if (sourceError) {
      throw new Error(sourceError);
    }
  }

  logger?.info("Successfully published to Firefox Add-ons!");
  return true;
}
