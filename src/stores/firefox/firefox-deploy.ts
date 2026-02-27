import { createHttpClient } from "../../http/client.js";
import { buildFormData } from "../../http/form-data.js";
import { generateJwt } from "../../http/jwt.js";
import { StoreStatus, type DeployContext } from "../../types.js";
import { createRateLimitHandler, requestWithRetry, type RateLimitHandler } from "../../utils/retry.js";
import { getExtJson } from "../../utils/zip.js";
import { FirefoxOptionsSubmissionApi, storeError } from "./firefox-input.js";
import {
  FirefoxUploadDetailSchema,
  FirefoxCreateNewVersionSchema,
  FirefoxUploadSourceSchema
} from "./firefox-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

let httpClient: ReturnType<typeof createHttpClient>;

function uploadZip({
  zip,
  jwtIssuer,
  jwtSecret,
  logger,
  onRateLimit
}: {
  zip: string;
  jwtIssuer: string;
  jwtSecret: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const formData = buildFormData([
    { name: "upload", value: fs.createReadStream(zip) },
    { name: "channel", value: "listed" }
  ]);

  return requestWithRetry({
    sendRequest: () => httpClient.post("upload/", formData.body, { headers: { ...formData.headers, Authorization: `JWT ${generateJwt({ jwtIssuer, jwtSecret })}` } }),
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
    onRateLimit
  });
}

async function createNewVersion({
  slug,
  uuid,
  changelog,
  changelogLang,
  devChangelog,
  zip,
  logger,
  onRateLimit
}: {
  slug: string;
  uuid: string;
  changelog: string;
  changelogLang: string;
  devChangelog: string;
  zip: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const { default_locale } = await getExtJson(zip);
  const locale = default_locale ?? changelogLang;

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
        ...(changelog && { release_notes: { [locale.replaceAll("_", "-")]: changelog } }),
        ...(devChangelog && { approval_notes: devChangelog })
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
    onRateLimit
  });
}

async function validateUpload({ uuid, logger, onRateLimit }: {
  uuid: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const pollIntervalMs = 5_000;

  for (;;) {
    const data = await requestWithRetry({
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
      logger,
      onRateLimit
    });

    if (data.processed) {
      const errors = (data.validation.messages || [])
        .filter(message => message.type === "error")
        .map(message => message.message);
      if (errors.length > 0) {
        throw new Error(storeError(errors.join("\n")));
      }
      return data;
    }

    await setTimeout(pollIntervalMs);
  }
}

function uploadSourceCodeIfNeeded({
  slug,
  zipSource,
  version,
  logger,
  onRateLimit
}: {
  slug: string;
  zipSource: string;
  version: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const formData = buildFormData([
    { name: "source", value: fs.createReadStream(zipSource) }
  ]);

  return requestWithRetry({
    sendRequest: () => httpClient.patch(`addon/${slug}/versions/${version}/`, formData.body, { headers: formData.headers }),
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
    onRateLimit
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
    changelogLang,
    devChangelog = ""
  }: FirefoxOptionsSubmissionApi,
  {
    logger, isVerbose, setStatus, setZipPath
  }: DeployContext = {}
) {
  httpClient = createHttpClient("https://addons.mozilla.org/api/v5/addons/", { Authorization: `JWT ${generateJwt({ jwtIssuer, jwtSecret })}` });

  const onRateLimit = createRateLimitHandler({
    manualDeployUrl: `https://addons.mozilla.org/developers/addon/${extId}/versions/submit/`,
    formatError: storeError,
    getWaitSeconds(response) {
      const detail = z.object({ detail: z.string() }).safeParse(response.data).data?.detail ?? "";
      return Number(detail.match(/\d+/)?.[0] || "60");
    },
    logger
  });

  setZipPath?.(zip);
  const { name } = await getExtJson(zip);

  if (isVerbose) {
    logger?.info(`Uploading zip of ${name} with extension ID ${extId}`);
  }

  const uploadData = await uploadZip({
    zip,
    jwtIssuer,
    jwtSecret,
    logger,
    onRateLimit
  });
  const { uuid, version } = uploadData;

  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  await validateUpload({ uuid, logger, onRateLimit });

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
    logger,
    onRateLimit
  });

  if (zipSource) {
    if (isVerbose) {
      logger?.info(`Uploading source ZIP: ${zipSource}`);
    }
    await uploadSourceCodeIfNeeded({
      slug: extId,
      zipSource,
      version,
      logger,
      onRateLimit
    });
  }

  logger?.info("Successfully published to Firefox Add-ons!");
  setStatus?.(StoreStatus.Success);
  return true;
}
