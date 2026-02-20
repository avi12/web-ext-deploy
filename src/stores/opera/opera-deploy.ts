import { z } from "zod";
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
import type { DeployContext } from "../../types.js";
import { CookieAuthError, getExtJson, toError } from "../../utils.js";
import fs from "node:fs";

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

async function fetchWithBackOff(
  url: string,
  options: RequestInit,
  logger?: DeployContext["logger"],
  onCookieExpired?: DeployContext["onCookieExpired"]
) {
  const maxDelay = 30_000;
  const maxRetries = 5;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders,
          ...options.headers }
      });
      if (response.ok) {
        const data: unknown = await response.json();
        return { data,
          status: response.status };
      }

      const isAuthFailure = response.status === 401 || response.status === 403;
      if (isAuthFailure && onCookieExpired && !hasCookieRefreshBeenAttempted) {
        hasCookieRefreshBeenAttempted = true;
        logger?.warning("Cookies expired, refreshing...");
        const freshCookies = await onCookieExpired();
        updateCookieHeaders(freshCookies);

        const retryResponse = await fetch(url, {
          ...options,
          headers: { ...defaultHeaders,
            ...options.headers }
        });
        if (retryResponse.ok) {
          const data: unknown = await retryResponse.json();
          return { data,
            status: retryResponse.status };
        }
      }
      if (isAuthFailure) {
        throw new CookieAuthError("Opera");
      }

      const isServerError = response.status >= 500;
      const isRetryable = attempt < maxRetries;
      if (isServerError && isRetryable) {
        const delay = Math.min(maxDelay, Math.pow(2, attempt) * 1000) * (1 + 0.5 * Math.random());
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw new Error(response.statusText);
    } catch(error) {
      const isRetryable = attempt < maxRetries;
      if (isRetryable) {
        const delay = Math.min(maxDelay, Math.pow(2, attempt) * 1000) * (1 + 0.5 * Math.random());
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw toError(error);
    }
  }

  throw new Error("Max retries exceeded");
}

async function handleRequestWithBackOff<T>({
  sendRequest,
  parseResponse,
  errorContext
}: {
  sendRequest: () => Promise<{ data: unknown; status: number }>;
  parseResponse: (data: unknown) => T;
  errorContext: string;
}): Promise<T> {
  try {
    const { data } = await sendRequest();
    return parseResponse(data);
  } catch(error: unknown) {
    if (error instanceof CookieAuthError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(storeError(`${errorContext}: ${errorMessage}`), { cause: error });
  }
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
  async function sendRequest() {
    return fetchWithBackOff(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/`,
      { method: "GET" },
      logger,
      onCookieExpired
    );
  }
  const params = new URLSearchParams({ language: default_locale });
  const url = `https://addons.opera.com/developer/package/${packageId}/version/${version}?${params}`;
  const data = await handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = ListingDetailSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Source code verification failed"
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

  async function sendRequest() {
    return fetchWithBackOff(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/cancel_changes/`,
      { method: "POST" },
      logger,
      onCookieExpired
    );
  }

  await handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = CancelChangesSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Cancel changes failed"
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
  async function sendRequest() {
    return fetchWithBackOff(
      `${BASE_URL}developer/package-versions/${packageId}-${version}/submit_for_moderation/`,
      { method: "POST" },
      logger,
      onCookieExpired
    );
  }
  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = SubmitChangesSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Submit changes failed"
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

  async function sendRequest() {
    return fetchWithBackOff(
      `${BASE_URL}file-upload/`,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: body
      },
      logger,
      onCookieExpired
    );
  }

  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = FileUploadResponseSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Upload failed"
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

  async function sendRequest() {
    return fetchWithBackOff(
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
    );
  }

  const data = await handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = UploadResultSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Upload verification failed"
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
  async function sendRequest() {
    return fetchWithBackOff(
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
    );
  }
  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = ListingDetailSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Changelog update failed"
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
  async function sendRequest() {
    return fetchWithBackOff(
      `${BASE_URL}developer/packages/${packageId}/`,
      { method: "GET" },
      logger,
      onCookieExpired
    );
  }
  return handleRequestWithBackOff({
    sendRequest,
    parseResponse: response => {
      const result = ListVersionsSchema.safeParse(response);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    },
    errorContext: "Get package versions failed"
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
