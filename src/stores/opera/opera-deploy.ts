import { z } from "zod";
import { OperaOptions } from "./opera-input.js";
import {
  ListVersionsSchema,
  ListingDetailSchema,
  SubmitChangesSchema,
  CancelChangesSchema,
  UploadResultSchema,
  FileUploadResponseSchema,
  type ListVersions
} from "./opera-types.js";
import type { CookieRefreshCallback, StoreLogger } from "../../types.js";
import { CookieAuthError, getErrorMessage, getExtJson } from "../../utils.js";
import fs from "node:fs";

const STORE = "Opera";

const BASE_URL = "https://addons.opera.com/api/";
let defaultHeaders: Record<string, string> = {};
let logger: StoreLogger | undefined;
let cookieRefreshCallback: CookieRefreshCallback | undefined;
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

async function fetchWithBackOff(url: string, options: RequestInit) {
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
      if (isAuthFailure && cookieRefreshCallback && !hasCookieRefreshBeenAttempted) {
        hasCookieRefreshBeenAttempted = true;
        logger?.warning("Cookies expired, refreshing...");
        const freshCookies = await cookieRefreshCallback();
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
    } catch (e) {
      const isRetryable = attempt < maxRetries;
      if (isRetryable) {
        const delay = Math.min(maxDelay, Math.pow(2, attempt) * 1000) * (1 + 0.5 * Math.random());
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw e;
    }
  }

  throw new Error("Max retries exceeded");
}

async function handleRequestWithBackOff<T>({
  sendRequest,
  parseResponse,
  errorActionOnFailure,
  zip
}: {
  sendRequest: () => Promise<{ data: unknown; status: number }>;
  parseResponse: (data: unknown) => T;
  errorActionOnFailure: string;
  zip: string;
}): Promise<[string] | [undefined, T]> {
  try {
    const { data } = await sendRequest();
    return [undefined, parseResponse(data)];
  } catch (e: unknown) {
    if (e instanceof CookieAuthError) {
      throw e;
    }

    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return [
      getErrorMessage({
        store: STORE,
        error: errorMessage,
        actionName: errorActionOnFailure,
        zip
      })
    ];
  }
}

async function verifySourceCodeExistence({
  zip,
  packageId
}: {
  zip: string;
  packageId: number;
}) {
  const extJson = await getExtJson(zip);
  const { version, default_locale = "en" } = extJson;
  const sendRequest = async () =>
    fetchWithBackOff(`${BASE_URL}developer/package-versions/${packageId}-${version}/`, { method: "GET" });
  const params = new URLSearchParams({ language: default_locale });
  const url = `https://addons.opera.com/developer/package/${packageId}/version/${version}?${params}`;
  const errorMessage = `No source code provided. Provide a URL in ${url} and submit the changes`;
  const [error, data] = await handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: d => ListingDetailSchema.parse(d),
    errorActionOnFailure: "verify source code existence of"
  });
  if (error) {
    return [error];
  }
  if (data.source_url || data.source_for_moderators_url) {
    return [undefined, true];
  }
  return [errorMessage];
}

async function cancelLatestVersionIfNotSubmitted({
  packageId,
  versionsListed,
  zip
}: {
  packageId: number;
  versionsListed: ListVersions["versions"];
  zip: string;
}) {
  if (versionsListed.length === 0 || versionsListed[0].submitted_for_moderation) {
    return [undefined] satisfies [undefined];
  }
  const { version } = versionsListed[0];
  logger?.info(`Canceling unsubmitted version ${version}`);

  const sendRequest = async () => {
    return fetchWithBackOff(`${BASE_URL}developer/package-versions/${packageId}-${version}/cancel_changes/`, {
      method: "POST"
    });
  };

  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: d => CancelChangesSchema.parse(d),
    errorActionOnFailure: "cancel unsubmitted changes of"
  });
}

async function submitChanges({ zip, packageId }: { zip: string; packageId: number }) {
  const extJson = await getExtJson(zip);
  const { version } = extJson;
  const sendRequest = async () =>
    fetchWithBackOff(`${BASE_URL}developer/package-versions/${packageId}-${version}/submit_for_moderation/`, {
      method: "POST"
    });
  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: d => SubmitChangesSchema.parse(d),
    errorActionOnFailure: "submit changes to"
  });
}

function getFileMetadata(zipPath: string) {
  const sizeInBytes = fs.statSync(zipPath).size;
  const zipName = z.string().parse(zipPath.split(/[\\/]/).pop());
  const zipNameWithoutForbiddenCharacters = zipName.replace(/[.]/g, "");
  const fileId = `${sizeInBytes}-${zipNameWithoutForbiddenCharacters}`;
  return { zipName,
    fileId };
}

async function uploadZip({ zip }: { zip: string }) {
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

  const sendRequest = async () =>
    fetchWithBackOff(`${BASE_URL}file-upload/`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: body
    });

  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: d => FileUploadResponseSchema.parse(d),
    errorActionOnFailure: "upload zip for"
  });
}

async function verifyUploadSuccessful({
  zipPath,
  packageId,
  lastVersion
}: {
  zipPath: string;
  packageId: number;
  lastVersion: string;
}) {
  const { zipName, fileId } = getFileMetadata(zipPath);

  const sendRequest = async () =>
    fetchWithBackOff(`${BASE_URL}developer/package-versions/?package_id=${packageId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: fileId,
        file_name: zipName,
        metadata_from: lastVersion
      })
    });

  const [error, data] = await handleRequestWithBackOff({
    zip: zipPath,
    sendRequest,
    parseResponse: d => UploadResultSchema.parse(d),
    errorActionOnFailure: "verify upload of"
  });
  if (error) {
    return [error];
  }
  if ("package_file" in data) {
    return [data.package_file];
  }
  return [undefined, data];
}

async function updateChangelog({ zip, packageId, changelog }: { zip: string; packageId: number; changelog: string }) {
  const { version, default_locale = "en" } = await getExtJson(zip);
  const sendRequest = async () =>
    fetchWithBackOff(`${BASE_URL}developer/package-versions/${packageId}-${version}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translations: {
          [default_locale]: {
            changelog
          }
        }
      })
    });
  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: d => ListingDetailSchema.parse(d),
    errorActionOnFailure: "update changelog of"
  });
}

function verifyVersionNotSubmittedForModeration({
  zip,
  versionsListed,
  version
}: {
  zip: string;
  versionsListed: ListVersions["versions"];
  version: string;
}): [string | undefined] {
  const isVersionAlreadySubmitted = versionsListed.some(
    entry => entry.version === version && entry.submitted_for_moderation
  );
  if (isVersionAlreadySubmitted) {
    return [
      getErrorMessage({
        store: STORE,
        error: `Version ${version} Has already been deployed`,
        actionName: "update",
        zip
      })
    ];
  }
  return [undefined];
}

async function getVersions({ zip, packageId }: { zip: string; packageId: number }) {
  const sendRequest = async () =>
    fetchWithBackOff(`${BASE_URL}developer/packages/${packageId}/`, { method: "GET" });
  return handleRequestWithBackOff({
    zip,
    sendRequest,
    parseResponse: d => ListVersionsSchema.parse(d),
    errorActionOnFailure: "get all package versions of"
  });
}

export default async function deployToOpera(
  { sessionid, csrftoken, packageId, zip, changelog = "" }: OperaOptions,
  storeLogger?: StoreLogger,
  onCookieExpired?: CookieRefreshCallback,
  verbose?: boolean
) {
  logger = storeLogger;
  cookieRefreshCallback = onCookieExpired;
  hasCookieRefreshBeenAttempted = false;

  defaultHeaders = {
    Accept: "application/json; version=1.0",
    Cookie: `csrftoken=${csrftoken}; sessionid=${sessionid}`,
    "X-Csrftoken": csrftoken,
    Referer: "https://addons.opera.com"
  };

  const { name, version } = await getExtJson(zip);

  if (verbose) {
    logger?.info(`Retrieving listed versions of ${name} with package ID ${packageId}`);
  }

  const [versionsError, versionsData] = await getVersions({ zip,
    packageId });
  if (versionsError) {
    throw versionsError;
  }

  if (verbose) {
    logger?.info(`Verifying version ${version}`);
  }

  const [moderationError] = verifyVersionNotSubmittedForModeration({ zip,
    versionsListed: versionsData.versions,
    version });
  if (moderationError) {
    throw moderationError;
  }

  const [cancelError] = await cancelLatestVersionIfNotSubmitted({ zip,
    packageId,
    versionsListed: versionsData.versions });
  if (cancelError) {
    throw cancelError;
  }

  if (verbose) {
    logger?.info("Uploading zip");
  }

  const [uploadError] = await uploadZip({ zip });
  if (uploadError) {
    throw uploadError;
  }

  if (verbose) {
    logger?.info("Verifying upload");
  }

  const lastVersion = versionsData.versions.find(v => v.submitted_for_moderation)?.version || "";
  const [verifyUploadError] = await verifyUploadSuccessful({ zipPath: zip,
    packageId,
    lastVersion });
  if (verifyUploadError) {
    throw verifyUploadError;
  }

  if (verbose) {
    logger?.info("Verifying source code existence");
  }

  const [sourceError] = await verifySourceCodeExistence({ zip,
    packageId });
  if (sourceError) {
    throw sourceError;
  }

  if (changelog) {
    if (verbose) {
      logger?.info("Updating changelog");
    }
    const [changelogError] = await updateChangelog({ zip,
      packageId,
      changelog });
    if (changelogError) {
      throw changelogError;
    }
  }

  if (verbose) {
    logger?.info("Submitting changes");
  }

  const [submitError] = await submitChanges({ zip,
    packageId });
  if (submitError) {
    throw submitError;
  }

  logger?.info("Successfully published to Opera Add-ons!");
  return true;
}
