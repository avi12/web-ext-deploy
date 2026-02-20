import { z } from "zod";
import { FirefoxOptionsSubmissionApi, storeError } from "./firefox-input.js";
import {
  FirefoxUploadDetailSchema,
  FirefoxCreateNewVersionSchema,
  FirefoxUploadSourceSchema,
  type FirefoxUploadDetail
} from "./firefox-types.js";
import { FormData } from "../../form-data.js";
import { createHttpClient, type HttpResponse } from "../../http-client.js";
import { generateJwt } from "../../jwt.js";
import type { DeployContext } from "../../types.js";
import { getExtJson, toError } from "../../utils.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";

const SECONDS_TO_TOKEN_EXPIRY = 60 * 3;

let httpClient: ReturnType<typeof createHttpClient>;

async function handleRequestWithBackOff<T>({
  sendRequest,
  parseResponse,
  errorContext,
  extId,
  logger
}: {
  sendRequest: () => Promise<HttpResponse<unknown>>;
  parseResponse: (data: unknown) => T;
  errorContext: string;
  extId: string;
  logger?: DeployContext["logger"];
}): Promise<T> {
  const maxRetries = 5;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await sendRequest();
      return parseResponse(response.data);
    } catch(error: unknown) {
      lastError = toError(error);
      const status = z.object({ status: z.coerce.number() }).safeParse(error).data?.status ?? 0;

      if (status >= 500 && attempt < maxRetries) {
        const delayInMs = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
        await setTimeout(delayInMs);
        continue;
      }

      if (status === 429) {
        const detail = z.object({
          data: z.object({ detail: z.string() })
        }).safeParse(error).data?.data.detail ?? "";
        const secondsToWait = Number(detail.match(/\d+/)?.[0] || "60");
        if (secondsToWait > 60) {
          throw new Error(
            storeError(`${errorContext}: Too many API requests. Deploy manually at https://addons.mozilla.org/developers/addons/${extId}/versions/submit/`),
            { cause: error }
          );
        }
        if (secondsToWait < SECONDS_TO_TOKEN_EXPIRY) {
          const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
          logger?.warning(
            `Too many requests. A retry will automatically be at ${newTime}\nOr, you can deploy manually: https://addons.mozilla.org/developers/addon/${extId}/versions/submit/`
          );
        }
        await setTimeout(secondsToWait * 1000);
        continue;
      }

      const errData = z.object({ data: z.unknown() }).safeParse(error).data?.data;
      const errStr = z.string().safeParse(errData).data ?? JSON.stringify(errData);
      let errorMessage = storeError(`${errorContext}: ${errStr}`);
      if (errorMessage.match(/release_notes.+The language code.+is invalid/)) {
        errorMessage +=
          " Supported language codes: https://github.com/mozilla/addons-server/blob/master/src/olympia/core/languages.py";
      }
      throw new Error(errorMessage, { cause: error });
    }
  }

  throw lastError;
}

async function uploadZip({
  zip,
  extId,
  jwtIssuer,
  jwtSecret,
  logger
}: {
  zip: string;
  extId: string;
  jwtIssuer: string;
  jwtSecret: string;
  logger?: DeployContext["logger"];
}) {
  const formData = new FormData();
  formData.append("upload", fs.createReadStream(zip));
  formData.append("channel", "listed");

  function sendRequest() {
    return httpClient.post("upload/", formData.getBody(), {
      headers: {
        ...formData.getHeaders(),
        Authorization: `JWT ${generateJwt({ jwtIssuer,
          jwtSecret })}`
      }
    });
  }

  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: data => {
      const result = FirefoxUploadDetailSchema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Upload failed",
    extId,
    logger
  });
}

async function createNewVersion({
  slug,
  uuid,
  changelog,
  changelogLang,
  devChangelog,
  zip,
  logger
}: {
  slug: string;
  uuid: string;
  changelog: string;
  changelogLang: string;
  devChangelog: string;
  zip: string;
  logger?: DeployContext["logger"];
}) {
  const { default_locale = changelogLang } = await getExtJson(zip);
  async function sendRequest() {
    return httpClient.post(
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
  }

  if (changelog) {
    logger?.info(`Adding changelog: ${changelog}`);
  }

  if (devChangelog) {
    logger?.info(`Adding changelog for reviewers: ${devChangelog}`);
  }

  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: data => {
      const result = FirefoxCreateNewVersionSchema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Version creation failed",
    extId: slug,
    logger
  });
}

async function validateUpload({
  extId,
  uuid,
  logger
}: {
  extId: string;
  uuid: string;
  logger?: DeployContext["logger"];
}) {
  let data: FirefoxUploadDetail;
  do {
    function sendRequest() {
      return httpClient.get(`upload/${uuid}/`);
    }
    data = await handleRequestWithBackOff({
      sendRequest,
      parseResponse: response => {
        const result = FirefoxUploadDetailSchema.safeParse(response);
        if (!result.success) {
          throw result.error;
        }
        return result.data;
      },
      errorContext: "Upload verification failed",
      extId,
      logger
    });
  } while (!data.processed);

  const errors: Array<string> = [];
  for (const message of data.validation.messages || []) {
    if (message.type === "error") {
      errors.push(message.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(storeError(errors.join("\n")));
  }

  return data;
}

async function uploadSourceCodeIfNeeded({
  slug,
  zipSource,
  version,
  logger
}: {
  slug: string;
  zipSource: string;
  version: string;
  logger?: DeployContext["logger"];
}) {
  const formData = new FormData();
  formData.append("source", fs.createReadStream(zipSource));

  async function sendRequest() {
    return httpClient.patch(`addon/${slug}/versions/${version}/`, formData.getBody(), {
      headers: formData.getHeaders()
    });
  }

  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: data => {
      const result = FirefoxUploadSourceSchema.safeParse(data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Source upload failed",
    extId: slug,
    logger
  });
}

export async function deployToFirefox(
  {
    extId,
    jwtIssuer,
    jwtSecret,
    zip,
    zipSource = "",
    changelog = "",
    changelogLang = "en-US",
    devChangelog = ""
  }: FirefoxOptionsSubmissionApi,
  { logger, isVerbose, setStatus, setZipPath }: DeployContext = {}
) {
  httpClient = createHttpClient("https://addons.mozilla.org/api/v5/addons/", {
    Authorization: `JWT ${generateJwt({ jwtIssuer,
      jwtSecret })}`
  });

  setZipPath?.(zip);
  const { name } = await getExtJson(zip);

  if (isVerbose) {
    logger?.info(`Uploading zip of ${name} with extension ID ${extId}`);
  }

  const uploadData = await uploadZip({ zip,
    extId,
    jwtIssuer,
    jwtSecret,
    logger });
  const { uuid, version } = uploadData;

  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  await validateUpload({ extId,
    uuid,
    logger });

  if (isVerbose) {
    logger?.info(`Creating a new version: ${version}`);
  }

  await createNewVersion({
    slug: extId,
    uuid,
    changelog,
    changelogLang,
    devChangelog,
    zip,
    logger
  });

  if (zipSource) {
    if (isVerbose) {
      logger?.info(`Uploading source ZIP: ${zipSource}`);
    }
    await uploadSourceCodeIfNeeded({
      slug: extId,
      zipSource,
      version,
      logger
    });
  }

  logger?.info("Successfully published to Firefox Add-ons!");
  setStatus?.("success");
  return true;
}
