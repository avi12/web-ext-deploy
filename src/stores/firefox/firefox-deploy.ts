import { createHttpClient } from "../../http/client.js";
import { buildFormData } from "../../http/form-data.js";
import { generateJwt } from "../../http/jwt.js";
import { StoreStatus, type DeployContext } from "../../types.js";
import { storeError } from "../../ui/logging.js";
import { createRateLimitHandler, requestWithRetry, type RateLimitHandler } from "../../utils/retry.js";
import { getExtJson } from "../../utils/zip.js";
import { FirefoxOptionsSubmissionApi } from "./firefox-input.js";
import {
  FirefoxUploadDetailSchema,
  FirefoxCreateNewVersionSchema,
  FirefoxUploadSourceSchema
} from "./firefox-types.js";
import fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

let httpClient: ReturnType<typeof createHttpClient>;

function authHeader(jwtIssuer: string, jwtSecret: string) {
  return { Authorization: `JWT ${generateJwt({ jwtIssuer, jwtSecret })}` };
}

/** @see https://mozilla.github.io/addons-server/topics/api/addons.html#upload-create */
function uploadZip({
  zip,
  jwtIssuer,
  jwtSecret,
  onRateLimit
}: {
  zip: string;
  jwtIssuer: string;
  jwtSecret: string;
  onRateLimit?: RateLimitHandler;
}) {
  const formData = buildFormData([
    { name: "upload", value: fs.createReadStream(zip), filename: path.basename(zip) },
    { name: "channel", value: "listed" }
  ]);

  return requestWithRetry({
    sendRequest: () => httpClient.post("upload/", formData.body, { headers: { ...formData.headers, ...authHeader(jwtIssuer, jwtSecret) } }),
    parseResponse(response) {
      const result = FirefoxUploadDetailSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }

      return result.data;
    },
    formatError: storeError,
    errorContext: "Upload failed",
    onRateLimit
  });
}

/** @see https://mozilla.github.io/addons-server/topics/api/addons.html#version-create */
async function createNewVersion({
  slug,
  uuid,
  changelog,
  changelogLang,
  devChangelog,
  jwtIssuer,
  jwtSecret,
  logger,
  onRateLimit
}: {
  slug: string;
  uuid: string;
  changelog: string;
  changelogLang: string;
  devChangelog: string;
  jwtIssuer: string;
  jwtSecret: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const locale = changelogLang ?? "en-US";
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
      { headers: { "Content-Type": "application/json", ...authHeader(jwtIssuer, jwtSecret) } }
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
    onRateLimit
  });
}

/** @see https://mozilla.github.io/addons-server/topics/api/addons.html#upload-detail */
async function validateUpload({
  uuid,
  jwtIssuer,
  jwtSecret,
  onRateLimit
}: {
  uuid: string;
  jwtIssuer: string;
  jwtSecret: string;
  onRateLimit?: RateLimitHandler;
}) {
  const pollIntervalMs = 5_000;
  let data: z.infer<typeof FirefoxUploadDetailSchema>;

  while (true) {
    data = await requestWithRetry({
      sendRequest: () => httpClient.get(`upload/${uuid}/`, { headers: authHeader(jwtIssuer, jwtSecret) }),
      parseResponse(response) {
        const result = FirefoxUploadDetailSchema.safeParse(response.data);
        if (!result.success) {
          throw result.error;
        }

        return result.data;
      },
      formatError: storeError,
      errorContext: "Upload verification failed",
      onRateLimit
    });

    if (data.processed) {
      break;
    }

    await setTimeout(pollIntervalMs);
  }

  const errors = (data.validation?.messages || [])
    .filter(message => message.type === "error")
    .map(message => message.message);
  if (errors.length > 0) {
    throw new Error(storeError(errors.join("\n")));
  }

  return data;
}

/** @see https://mozilla.github.io/addons-server/topics/api/addons.html#version-edit */
function uploadSourceCodeIfNeeded({
  slug,
  zipSource,
  version,
  jwtIssuer,
  jwtSecret,
  onRateLimit
}: {
  slug: string;
  zipSource: string;
  version: string;
  jwtIssuer: string;
  jwtSecret: string;
  onRateLimit?: RateLimitHandler;
}) {
  const formData = buildFormData([
    { name: "source", value: fs.createReadStream(zipSource), filename: path.basename(zipSource) }
  ]);

  return requestWithRetry({
    sendRequest: () => httpClient.patch(`addon/${slug}/versions/${version}/`, formData.body, { headers: { ...formData.headers, ...authHeader(jwtIssuer, jwtSecret) } }),
    parseResponse(response) {
      const result = FirefoxUploadSourceSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }

      return result.data;
    },
    formatError: storeError,
    errorContext: "Source upload failed",
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
    logger, isVerbose, setStatus, setZipPath, setExtensionName
  }: DeployContext = {}
) {
  httpClient = createHttpClient("https://addons.mozilla.org/api/v5/addons/");

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
  setExtensionName?.(name);

  if (isVerbose) {
    logger?.info(`Uploading zip of ${name} with extension ID ${extId}`);
  }

  const uploadData = await uploadZip({
    zip,
    jwtIssuer,
    jwtSecret,
    onRateLimit
  });
  const { uuid, version } = uploadData;
  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  await validateUpload({
    uuid, jwtIssuer, jwtSecret, onRateLimit
  });

  if (isVerbose) {
    logger?.info(`Creating a new version: ${version}`);
  }

  await createNewVersion({
    slug: extId,
    uuid,
    changelog,
    changelogLang,
    devChangelog,
    jwtIssuer,
    jwtSecret,
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
      jwtIssuer,
      jwtSecret,
      onRateLimit
    });
  }

  setStatus?.(StoreStatus.Success);
  return true;
}
