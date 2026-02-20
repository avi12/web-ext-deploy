import type { DeployContext } from "../../types.js";
import { CookieAuthError, getExtJson, requestWithRetry, type HttpLikeResponse } from "../../utils.js";
import { OperaOptions, storeError } from "./opera-input.js";
import {
  ListVersionsSchema,
  ListingDetailSchema,
  SubmitChangesSchema,
  CancelChangesSchema,
  UploadResultSchema,
  FileUploadResponseSchema,
  type ListVersions,
  type UploadResult
} from "./opera-types.js";
import fs from "node:fs";
import { z } from "zod";

const BASE_URL = "https://addons.opera.com/api/";

let defaultHeaders: Record<string, string> = {};
let hasCookieRefreshBeenAttempted = false;

function updateCookieHeaders(freshCookies: Record<string, string>) {
  const csrftoken = freshCookies["csrftoken"] || "";
  const sessionid = freshCookies["sessionid"] || "";
  defaultHeaders = {
    ...defaultHeaders,
    Cookie: `csrftoken=${csrftoken}; sessionid=${sessionid}`,
    "X-Csrftoken": csrftoken
  };
}

async function fetchWithAuth(
  url: string,
  options: RequestInit,
  logger?: DeployContext["logger"],
  onCookieExpired?: DeployContext["onCookieExpired"]
): Promise<HttpLikeResponse> {
  let response = await fetch(url, {
    ...options,
    headers: { ...defaultHeaders,
      ...options.headers }
  });

  const isAuthFailure = response.status === 401 || response.status === 403;
  if (isAuthFailure && onCookieExpired && !hasCookieRefreshBeenAttempted) {
    hasCookieRefreshBeenAttempted = true;
    logger?.warning("Cookies expired, refreshing...");
    const freshCookies = await onCookieExpired();
    updateCookieHeaders(freshCookies);

    response = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders,
        ...options.headers }
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new CookieAuthError("Opera");
  }

  const data: unknown = await response.json();
  return { data,
    status: response.status,
    statusText: response.statusText };
}

async function verifySourceCodeExistence({
  zip,
  packageId,
  logger,
  onCookieExpired
}: {
  zip: string;
  packageId: number;
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
}) {
  const extJson = await getExtJson(zip);
  const { version, default_locale = "en" } = extJson;
  const params = new URLSearchParams({ language: default_locale });
  const url = `https://addons.opera.com/developer/package/${packageId}/version/${version}?${params}`;

  const data = await requestWithRetry({
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/`,
      { method: "GET" },
      logger,
      onCookieExpired
    ),
    parseResponse(response) {
      const result = ListingDetailSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Source code verification failed",
    logger
  });

  if (!data.source_url && !data.source_for_moderators_url) {
    throw new Error(storeError(`No source code provided. Provide a URL in ${url} and submit the changes`));
  }
}

async function cancelLatestVersionIfNotSubmitted({
  packageId,
  versionsListed,
  logger,
  onCookieExpired
}: {
  packageId: number;
  versionsListed: ListVersions["versions"];
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
}) {
  if (versionsListed.length === 0 || versionsListed[0].submitted_for_moderation) {
    return;
  }
  const { version } = versionsListed[0];
  logger?.info(`Canceling unsubmitted version ${version}`);

  await requestWithRetry({
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/cancel_changes/`,
      { method: "POST" },
      logger,
      onCookieExpired
    ),
    parseResponse(response) {
      const result = CancelChangesSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Cancel changes failed",
    logger
  });
}

async function submitChanges({
  zip,
  packageId,
  logger,
  onCookieExpired
}: {
  zip: string;
  packageId: number;
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
}) {
  const extJson = await getExtJson(zip);
  const { version } = extJson;

  return requestWithRetry({
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/submit_for_moderation/`,
      { method: "POST" },
      logger,
      onCookieExpired
    ),
    parseResponse(response) {
      const result = SubmitChangesSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Submit changes failed",
    logger
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
  return { zipName,
    fileId };
}

async function uploadZip({
  zip,
  logger,
  onCookieExpired
}: {
  zip: string;
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
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
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}file-upload/`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body
      },
      logger,
      onCookieExpired
    ),
    parseResponse(response) {
      const result = FileUploadResponseSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Upload failed",
    logger
  });
}

async function verifyUploadSuccessful({
  zipPath,
  packageId,
  lastVersion,
  logger,
  onCookieExpired
}: {
  zipPath: string;
  packageId: number;
  lastVersion: string;
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
}): Promise<UploadResult> {
  const { zipName, fileId } = getFileMetadata(zipPath);

  const data = await requestWithRetry({
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}developer/package-versions/?package_id=${packageId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: fileId,
          file_name: zipName,
          metadata_from: lastVersion
        })
      },
      logger,
      onCookieExpired
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
    logger
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
  onCookieExpired
}: {
  zip: string;
  packageId: number;
  changelog: string;
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
}) {
  const { version, default_locale = "en" } = await getExtJson(zip);

  return requestWithRetry({
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translations: {
            [default_locale]: {
              changelog
            }
          }
        })
      },
      logger,
      onCookieExpired
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
    logger
  });
}

function verifyVersionNotSubmittedForModeration({
  versionsListed,
  version
}: {
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

async function getVersions({
  packageId,
  logger,
  onCookieExpired
}: {
  packageId: number;
  logger?: DeployContext["logger"];
  onCookieExpired?: DeployContext["onCookieExpired"];
}) {
  return requestWithRetry({
    sendRequest: () => fetchWithAuth(
      `${BASE_URL}developer/packages/${packageId}/`,
      { method: "GET" },
      logger,
      onCookieExpired
    ),
    parseResponse(response) {
      const result = ListVersionsSchema.safeParse(response.data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    formatError: storeError,
    errorContext: "Get package versions failed",
    logger
  });
}

export async function deployToOpera(
  { sessionid, csrftoken, packageId, zip, changelog = "" }: OperaOptions,
  { logger, onCookieExpired, isVerbose, setStatus, setZipPath }: DeployContext = {}
) {
  hasCookieRefreshBeenAttempted = false;

  defaultHeaders = {
    Accept: "application/json; version=1.0",
    Cookie: `csrftoken=${csrftoken}; sessionid=${sessionid}`,
    "X-Csrftoken": csrftoken,
    Referer: "https://addons.opera.com"
  };

  setZipPath?.(zip);
  const { name, version } = await getExtJson(zip);

  if (isVerbose) {
    logger?.info(`Retrieving listed versions of ${name} with package ID ${packageId}`);
  }

  const versionsData = await getVersions({ packageId,
    logger,
    onCookieExpired });

  if (isVerbose) {
    logger?.info(`Verifying version ${version}`);
  }

  verifyVersionNotSubmittedForModeration({ versionsListed: versionsData.versions,
    version });

  await cancelLatestVersionIfNotSubmitted({
    packageId,
    versionsListed: versionsData.versions,
    logger,
    onCookieExpired
  });

  if (isVerbose) {
    logger?.info("Uploading zip");
  }

  await uploadZip({ zip,
    logger,
    onCookieExpired });

  if (isVerbose) {
    logger?.info("Verifying upload");
  }

  const lastVersion = versionsData.versions.find(entry => entry.submitted_for_moderation)?.version || "";
  await verifyUploadSuccessful({ zipPath: zip,
    packageId,
    lastVersion,
    logger,
    onCookieExpired });

  if (isVerbose) {
    logger?.info("Verifying source code existence");
  }

  await verifySourceCodeExistence({ zip,
    packageId,
    logger,
    onCookieExpired });

  if (changelog) {
    if (isVerbose) {
      logger?.info("Updating changelog");
    }
    await updateChangelog({ zip,
      packageId,
      changelog,
      logger,
      onCookieExpired });
  }

  if (isVerbose) {
    logger?.info("Submitting changes");
  }

  await submitChanges({ zip,
    packageId,
    logger,
    onCookieExpired });

  logger?.info("Successfully published to Opera Add-ons!");
  setStatus?.("success");
  return true;
}
