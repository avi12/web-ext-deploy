import { createHttpClient } from "../../http/client.js";
import { type DeployContext, StoreStatus } from "../../types.js";
import { CookieAuthError,
  createRateLimitHandler,
  type HttpLikeResponse,
  type RateLimitHandler,
  requestWithRetry } from "../../utils/retry.js";
import { getExtJson } from "../../utils/zip.js";
import { OperaOptions, storeError } from "./opera-input.js";
import { CancelChangesSchema,
  FileUploadResponseSchema,
  ListingDetailSchema,
  type ListVersions,
  ListVersionsSchema,
  SubmitChangesSchema,
  type UploadResult,
  UploadResultSchema } from "./opera-types.js";
import fs from "node:fs";
import { z } from "zod";

let httpClient: ReturnType<typeof createOperaHttpClient>;

function createOperaHttpClient(
  cookies: { sessionid: string; csrftoken: string },
  logger?: DeployContext["logger"],
  onCookieExpired?: DeployContext["onCookieExpired"]
) {
  const client = createHttpClient("https://addons.opera.com/api/", {
    Accept: "application/json; version=1.0",
    Referer: "https://addons.opera.com"
  });

  let { csrftoken, sessionid } = cookies;

  function cookieHeaders() {
    return {
      Cookie: `csrftoken=${csrftoken}; sessionid=${sessionid}`,
      "X-Csrftoken": csrftoken
    };
  }

  async function withCookieRefresh(sendRequest: () => Promise<HttpLikeResponse>): Promise<HttpLikeResponse> {
    const response = await sendRequest();
    const isAuthFailure = response.status === 401 || response.status === 403;
    if (!isAuthFailure) {
      return response;
    }

    if (!onCookieExpired) {
      throw new CookieAuthError("Opera");
    }

    logger?.warning("Cookies expired, refreshing...");
    const freshCookies = await onCookieExpired();
    csrftoken = freshCookies.csrftoken || "";
    sessionid = freshCookies.sessionid || "";

    const retryResponse = await sendRequest();
    if (retryResponse.status === 401 || retryResponse.status === 403) {
      throw new CookieAuthError("Opera");
    }
    return retryResponse;
  }

  function get(endpoint: string) {
    return withCookieRefresh(() => client.get(endpoint, { headers: cookieHeaders() }));
  }

  function post(endpoint: string, body?: BodyInit, options?: { headers?: Record<string, string>; params?: Record<string, string | number> }) {
    return withCookieRefresh(() => client.post(endpoint, body, { ...options, headers: { ...cookieHeaders(), ...options?.headers } }));
  }

  function patch(endpoint: string, body?: BodyInit, options?: { headers?: Record<string, string> }) {
    return withCookieRefresh(() => client.patch(endpoint, body, { ...options, headers: { ...cookieHeaders(), ...options?.headers } }));
  }

  return { get, post, patch };
}

async function verifySourceCodeExistence({
  zip,
  packageId,
  logger,
  onRateLimit
}: {
  zip: string;
  packageId: number;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const extJson = await getExtJson(zip);
  const { version, default_locale = "en" } = extJson;
  const params = new URLSearchParams({ language: default_locale });
  const url = `https://addons.opera.com/developer/package/${packageId}/version/${version}?${params}`;

  const data = await requestWithRetry({
    sendRequest: () => httpClient.get(`developer/package-versions/${packageId}-${version}/`),
    parseResponse(response) {
      const result = ListingDetailSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Source code verification failed",
    logger,
    onRateLimit
  });

  if (!data.source_url && !data.source_for_moderators_url) {
    throw new Error(storeError(`No source code provided. Provide a URL in ${url} and submit the changes`));
  }
}

async function cancelLatestVersionIfNotSubmitted({
  packageId,
  versionsListed,
  logger,
  onRateLimit
}: {
  packageId: number;
  versionsListed: ListVersions["versions"];
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  if (versionsListed.length === 0 || versionsListed[0].submitted_for_moderation) {
    return;
  }
  const { version } = versionsListed[0];
  logger?.info(`Canceling unsubmitted version ${version}`);

  await requestWithRetry({
    sendRequest: () => httpClient.post(`developer/package-versions/${packageId}-${version}/cancel_changes/`),
    parseResponse(response) {
      const result = CancelChangesSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Cancel changes failed",
    logger,
    onRateLimit
  });
}

async function submitChanges({
  zip,
  packageId,
  logger,
  onRateLimit
}: {
  zip: string;
  packageId: number;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const extJson = await getExtJson(zip);
  const { version } = extJson;

  return requestWithRetry({
    sendRequest: () => httpClient.post(`developer/package-versions/${packageId}-${version}/submit_for_moderation/`),
    parseResponse(response) {
      const result = SubmitChangesSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Submit changes failed",
    logger,
    onRateLimit
  });
}

function getFileMetadata(zipPath: string) {
  const sizeInBytes = fs.statSync(zipPath).size;
  const zipNameResult = z.string().safeParse(zipPath.split(/[\\/]/).pop());
  if (!zipNameResult.success) {
    throw new Error(`Invalid zip path: ${zipPath}`);
  }
  const zipName = zipNameResult.data;
  const zipNameWithoutForbiddenCharacters = zipName.replace(/[.]/g, "");
  const fileId = `${sizeInBytes}-${zipNameWithoutForbiddenCharacters}`;
  return { zipName, fileId };
}

async function uploadZip({
  zip,
  logger,
  onRateLimit
}: {
  zip: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const { zipName, fileId } = getFileMetadata(zip);

  const fileStream = fs.createReadStream(zip);
  const fileBuffer = await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    fileStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    fileStream.on("end", () => resolve(Buffer.concat(chunks)));
    fileStream.on("error", reject);
  });

  const boundary = `----WebKitFormBoundary${Date.now()}`;
  const filePart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="flowChunkNumber"; filename="${zipName}"\r\nContent-Type: application/zip\r\n\r\n`
  );
  const identifierPart = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="flowFilename"\r\n\r\n${zipName}\r\n--${boundary}\r\nContent-Disposition: form-data; name="flowIdentifier"\r\n\r\n${fileId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${zipName}"\r\nContent-Type: application/zip\r\n\r\n`
  );
  const closingPart = Buffer.from(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat([filePart, fileBuffer, identifierPart, fileBuffer, closingPart]);

  return requestWithRetry({
    sendRequest: () => httpClient.post("file-upload/", body, { headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` } }),
    parseResponse(response) {
      const result = FileUploadResponseSchema.safeParse(response.data);
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

async function verifyUploadSuccessful({
  zipPath,
  packageId,
  lastVersion,
  logger,
  onRateLimit
}: {
  zipPath: string;
  packageId: number;
  lastVersion: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}): Promise<UploadResult> {
  const { zipName, fileId } = getFileMetadata(zipPath);

  const data = await requestWithRetry({
    sendRequest: () => httpClient.post(
      "developer/package-versions/",
      JSON.stringify({
        file_id: fileId,
        file_name: zipName,
        metadata_from: lastVersion
      }),
      {
        params: { package_id: packageId },
        headers: { "Content-Type": "application/json" }
      }
    ),
    parseResponse(response) {
      const result = UploadResultSchema.safeParse(response.data);
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

  if ("package_file" in data) {
    throw new Error(storeError(data.package_file));
  }
  return data;
}

async function updateChangelog({
  zip,
  packageId,
  changelog,
  logger,
  onRateLimit
}: {
  zip: string;
  packageId: number;
  changelog: string;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  const { version, default_locale = "en" } = await getExtJson(zip);

  return requestWithRetry({
    sendRequest: () => httpClient.patch(
      `developer/package-versions/${packageId}-${version}/`,
      JSON.stringify({ translations: { [default_locale]: { changelog } } }),
      { headers: { "Content-Type": "application/json" } }
    ),
    parseResponse(response) {
      const result = ListingDetailSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Changelog update failed",
    logger,
    onRateLimit
  });
}

function verifyVersionNotSubmittedForModeration({ versionsListed, version }: {
  versionsListed: ListVersions["versions"];
  version: string;
}) {
  const isVersionAlreadySubmitted = versionsListed.some(
    entry => entry.version === version && entry.submitted_for_moderation
  );
  if (isVersionAlreadySubmitted) {
    throw new Error(storeError(`Version ${version} has already been deployed`));
  }
}

function getVersions({
  packageId,
  logger,
  onRateLimit
}: {
  packageId: number;
  logger?: DeployContext["logger"];
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
    sendRequest: () => httpClient.get(`developer/packages/${packageId}/`),
    parseResponse(response) {
      const result = ListVersionsSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Get package versions failed",
    logger,
    onRateLimit
  });
}

export async function deployToOpera(
  {
    sessionid, csrftoken, packageId, zip, changelog = ""
  }: OperaOptions,
  {
    logger, onCookieExpired, isVerbose, setStatus, setZipPath
  }: DeployContext = {}
) {
  httpClient = createOperaHttpClient({ sessionid, csrftoken }, logger, onCookieExpired);

  const onRateLimit = createRateLimitHandler({
    manualDeployUrl: `https://addons.opera.com/developer/package/${packageId}/`,
    formatError: storeError,
    logger
  });

  setZipPath?.(zip);
  const { name, version } = await getExtJson(zip);

  if (isVerbose) {
    logger?.info(`Retrieving listed versions of ${name} with package ID ${packageId}`);
  }

  const versionsData = await getVersions({
    packageId,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info(`Verifying version ${version}`);
  }

  verifyVersionNotSubmittedForModeration({
    versionsListed: versionsData.versions,
    version
  });

  await cancelLatestVersionIfNotSubmitted({
    packageId,
    versionsListed: versionsData.versions,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Uploading zip");
  }

  await uploadZip({
    zip,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  const lastVersion = versionsData.versions.find(entry => entry.submitted_for_moderation)?.version || "";
  await verifyUploadSuccessful({
    zipPath: zip,
    packageId,
    lastVersion,
    logger,
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Verifying source code existence");
  }

  await verifySourceCodeExistence({
    zip,
    packageId,
    logger,
    onRateLimit
  });

  if (changelog) {
    if (isVerbose) {
      logger?.info("Updating changelog");
    }
    await updateChangelog({
      zip,
      packageId,
      changelog,
      logger,
      onRateLimit
    });
  }

  if (isVerbose) {
    logger?.info("Submitting changes");
  }

  await submitChanges({
    zip,
    packageId,
    logger,
    onRateLimit
  });

  logger?.info("Successfully published to Opera Add-ons!");
  setStatus?.(StoreStatus.Success);
  return true;
}
