import { FormData } from "../../form-data.js";
import { createHttpClient } from "../../http-client.js";
import { generateJwt } from "../../jwt.js";
import type { DeployContext } from "../../types.js";
import { getExtJson, requestWithRetry, type HttpLikeResponse } from "../../utils.js";
import { FirefoxOptionsSubmissionApi, storeError } from "./firefox-input.js";
import {
  FirefoxUploadDetailSchema,
  FirefoxCreateNewVersionSchema,
  FirefoxUploadSourceSchema,
  type FirefoxUploadDetail
} from "./firefox-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

const SECONDS_TO_TOKEN_EXPIRY = 60 * 3;

let httpClient: ReturnType<typeof createHttpClient>;

function handleFirefoxRateLimit(extId: string, errorContext: string, logger?: DeployContext["logger"]) {
  return async(response: HttpLikeResponse) => {
    const detail = z.object({ detail: z.string() }).safeParse(response.data).data?.detail ?? "";
    const secondsToWait = Number(detail.match(/\d+/)?.[0] || "60");
    if (secondsToWait > 60) {
      throw new Error(
        storeError(`${errorContext}: Too many API requests. Deploy manually at https://addons.mozilla.org/developers/addons/${extId}/versions/submit/`)
      );
    }
    if (secondsToWait < SECONDS_TO_TOKEN_EXPIRY) {
      const newTime = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
      logger?.warning(
        `Too many requests. A retry will automatically be at ${newTime}\nOr, you can deploy manually: https://addons.mozilla.org/developers/addon/${extId}/versions/submit/`
      );
    }
    await setTimeout(secondsToWait * 1000);
  };
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

  return requestWithRetry({
    sendRequest: () => httpClient.post("upload/", formData.getBody(), {
      headers: {
        ...formData.getHeaders(),
        Authorization: `JWT ${generateJwt({ jwtIssuer,
          jwtSecret })}`
      }
    }),
    parseResponse(response) {
      const result = FirefoxUploadDetailSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Upload failed",
    logger,
    onRateLimit: handleFirefoxRateLimit(extId, "Upload failed", logger)
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

  if (changelog) {
    logger?.info(`Adding changelog: ${changelog}`);
  }

  if (devChangelog) {
    logger?.info(`Adding changelog for reviewers: ${devChangelog}`);
  }

  return requestWithRetry({
    sendRequest: () => httpClient.post(
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
    ),
    parseResponse(response) {
      const result = FirefoxCreateNewVersionSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Version creation failed",
    logger,
    onRateLimit: handleFirefoxRateLimit(slug, "Version creation failed", logger)
  });
}

async function validateUpload({
  uuid,
  logger
}: {
  uuid: string;
  logger?: DeployContext["logger"];
}) {
  const pollIntervalMs = 5_000;

  let data: FirefoxUploadDetail;
  do {
    data = await requestWithRetry({
      sendRequest: () => httpClient.get(`upload/${uuid}/`),
      parseResponse(response) {
        const result = FirefoxUploadDetailSchema.safeParse(response.data);
        if (!result.success) {
          throw result.error;
        }
        return result.data;
      },
      formatError: storeError,
      errorContext: "Upload verification failed",
      logger
    });
    await setTimeout(pollIntervalMs);
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

  return requestWithRetry({
    sendRequest: () => httpClient.patch(`addon/${slug}/versions/${version}/`, formData.getBody(), {
      headers: formData.getHeaders()
    }),
    parseResponse(response) {
      const result = FirefoxUploadSourceSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Source upload failed",
    logger,
    onRateLimit: handleFirefoxRateLimit(slug, "Source upload failed", logger)
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

  await validateUpload({ uuid,
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
