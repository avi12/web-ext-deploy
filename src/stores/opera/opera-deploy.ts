import { createHttpClient } from "../../http/client.js";
import { buildFormData } from "../../http/form-data.js";
import { type DeployContext, StoreStatus } from "../../types.js";
import { storeError } from "../../ui/logging.js";
import {
  CookieAuthError,
  createRateLimitHandler,
  type HttpLikeResponse,
  type RateLimitHandler,
  requestWithRetry
} from "../../utils/retry.js";
import { getExtJson } from "../../utils/zip.js";
import { OperaOptions } from "./opera-input.js";
import {
  CancelChangesSchema,
  FileUploadResponseSchema,
  ListingDetailSchema,
  type ListVersions,
  ListVersionsSchema,
  SubmitChangesSchema,
  type UploadResult,
  UploadResultSchema
} from "./opera-types.js";
import fs from "node:fs";
import { z } from "zod";

const UPLOAD_CHUNK_SIZE_BYTES = 1024 * 1024;

let httpClient: ReturnType<typeof createOperaHttpClient>;

function createOperaHttpClient(
  cookies: { sessionid: string; csrftoken: string },
  logger?: DeployContext["logger"],
  onCredentialsExpired?: DeployContext["onCredentialsExpired"]
) {
  const client = createHttpClient("https://addons.opera.com/api/", {
    Accept: "application/json; version=1.0",
    Referer: "https://addons.opera.com"
  });

  let { csrftoken, sessionid } = cookies;

  // Opera's file-upload endpoint sits behind an nginx ingress that pins a chunked upload to a single
  // backend pod via a Set-Cookie sticky-session cookie (INGRESSCOOKIE_API). Every chunk and the finalize
  // must carry it or the chunks scatter across pods and reassembly fails ("not a valid ZIP" / 500).
  let stickySessionCookie = "";

  function cookieHeaders() {
    return {
      Cookie: `csrftoken=${csrftoken}; sessionid=${sessionid}${stickySessionCookie ? `; ${stickySessionCookie}` : ""}`,
      "X-Csrftoken": csrftoken
    };
  }

  function absorbSetCookies(response: HttpLikeResponse) {
    const setCookie = response.setCookies?.find(cookie => cookie.startsWith("INGRESSCOOKIE_API="));
    if (!setCookie) {
      return;
    }

    [stickySessionCookie] = setCookie.split(";");
  }

  async function withCookieRefresh(sendRequest: () => Promise<HttpLikeResponse>): Promise<HttpLikeResponse> {
    const response = await sendRequest();
    absorbSetCookies(response);
    const isAuthFailure = response.status === 401 || response.status === 403;
    if (!isAuthFailure) {
      return response;
    }

    if (!onCredentialsExpired) {
      throw new CookieAuthError("Opera");
    }

    logger?.warning("Cookies expired, refreshing...");
    let freshCookies: Record<string, string>;
    try {
      freshCookies = await onCredentialsExpired();
    } catch {
      throw new CookieAuthError("Opera");
    }

    const freshCsrftoken = freshCookies.csrftoken;
    const freshSessionid = freshCookies.sessionid;
    if (!freshCsrftoken || !freshSessionid) {
      throw new CookieAuthError("Opera");
    }

    csrftoken = freshCsrftoken;
    sessionid = freshSessionid;

    const retryResponse = await sendRequest();
    absorbSetCookies(retryResponse);
    const isStillUnauthorized = retryResponse.status === 401 || retryResponse.status === 403;
    if (isStillUnauthorized) {
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

function getVersionListingDetail({
  packageId,
  version,
  onRateLimit
}: {
  packageId: number;
  version: string;
  onRateLimit?: RateLimitHandler;
}) {
  return requestWithRetry({
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
    onRateLimit
  });
}

async function verifySourceCodeExistence({
  zip,
  packageId,
  lastVersion,
  onRateLimit
}: {
  zip: string;
  packageId: number;
  lastVersion: string;
  onRateLimit?: RateLimitHandler;
}) {
  const { version, default_locale = "en" } = await getExtJson(zip);
  const queryParameters = new URLSearchParams({ language: default_locale });
  const url = `https://addons.opera.com/developer/package/${packageId}/version/${version}?${queryParameters}`;

  // The public source URL lives on the previously submitted version and is not always reflected on the
  // freshly uploaded version, so check both and accept either a public or a moderator source URL.
  const versionsToCheck = lastVersion && lastVersion !== version ? [version, lastVersion] : [version];
  const listingDetails = await Promise.all(
    versionsToCheck.map(versionToCheck => getVersionListingDetail({ packageId, version: versionToCheck, onRateLimit }))
  );

  const isSourceCodeProvided = listingDetails.some(detail => detail.source_url || detail.source_for_moderators_url);
  if (!isSourceCodeProvided) {
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
  const isEmpty = versionsListed.length === 0;
  const isAlreadySubmitted = !isEmpty && versionsListed[0].submitted_for_moderation;
  if (isEmpty || isAlreadySubmitted) {
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
    onRateLimit
  });
}

async function submitChanges({
  zip,
  packageId,
  isAutoModerationAvailable,
  onRateLimit
}: {
  zip: string;
  packageId: number;
  isAutoModerationAvailable: boolean;
  onRateLimit?: RateLimitHandler;
}) {
  const extJson = await getExtJson(zip);
  const { version } = extJson;

  try {
    await requestWithRetry({
      sendRequest: () => httpClient.post(
        `developer/package-versions/${packageId}-${version}/submit_for_moderation/`,
        JSON.stringify({ auto_moderation: isAutoModerationAvailable }),
        { headers: { "Content-Type": "application/json" } }
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
      onRateLimit
    });
  } catch (error) {
    // The submit request may have succeeded on the server but returned an error response.
    // Verify the actual submission state before propagating the error.
    const versionDetail = await requestWithRetry({
      sendRequest: () => httpClient.get(`developer/package-versions/${packageId}-${version}/`),
      parseResponse(response) {
        const result = ListingDetailSchema.safeParse(response.data);
        if (!result.success) {
          throw result.error;
        }

        return result.data;
      },
      formatError: storeError,
      errorContext: "Version state verification failed",
      onRateLimit
    });
    if (!versionDetail.submitted_for_moderation) {
      throw error;
    }
  }
}

function getFileMetadata(zipPath: string) {
  const sizeInBytes = fs.statSync(zipPath).size;
  const zipNameResult = z.string().safeParse(zipPath.split(/[\\/]/).pop());
  if (!zipNameResult.success) {
    throw new Error(`Invalid zip path: ${zipPath}`);
  }

  const zipName = zipNameResult.data;

  // Matches ng-flow's generateUniqueIdentifier (the store's dashboard uploader), which strips every
  // character outside [0-9a-zA-Z_-] from the name - the server keys the reassembled file by this.
  const zipNameWithoutForbiddenCharacters = zipName.replace(/[^0-9a-zA-Z_-]/g, "");
  const fileId = `${sizeInBytes}-${zipNameWithoutForbiddenCharacters}`;
  return { zipName, fileId, sizeInBytes };
}

async function uploadChunk({
  chunk,
  chunkNumber,
  totalChunks,
  totalSize,
  zipName,
  fileId,
  onRateLimit
}: {
  chunk: Buffer;
  chunkNumber: number;
  totalChunks: number;
  totalSize: number;
  zipName: string;
  fileId: string;
  onRateLimit?: RateLimitHandler;
}) {
  const formData = buildFormData([
    { name: "flowChunkNumber", value: String(chunkNumber) },
    { name: "flowChunkSize", value: String(UPLOAD_CHUNK_SIZE_BYTES) },
    { name: "flowCurrentChunkSize", value: String(chunk.length) },
    { name: "flowTotalSize", value: String(totalSize) },
    { name: "flowIdentifier", value: fileId },
    { name: "flowFilename", value: zipName },
    { name: "flowRelativePath", value: zipName },
    { name: "flowTotalChunks", value: String(totalChunks) },
    {
      name: "file", value: chunk, filename: zipName, contentType: "application/x-zip-compressed"
    }
  ]);

  return requestWithRetry({
    sendRequest: () => httpClient.post("file-upload/", formData.body, { headers: { "Content-Type": formData.headers["Content-Type"] } }),
    parseResponse(response) {
      const result = FileUploadResponseSchema.safeParse(response.data);
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

// Opera's file-upload endpoint is ng-flow behind nginx, which rejects a single body over ~1.5 MB
// with 413. Split the ZIP the way ng-flow does with forceChunkSize disabled: floor(size / chunkSize)
// chunks where the final chunk absorbs the trailing remainder (so it can exceed one chunk size). The
// server reassembles them by the shared flowIdentifier.
async function uploadZip({
  zip,
  onRateLimit
}: {
  zip: string;
  onRateLimit?: RateLimitHandler;
}) {
  const { zipName, fileId, sizeInBytes } = getFileMetadata(zip);
  const file = fs.readFileSync(zip);
  const totalChunks = Math.max(Math.floor(sizeInBytes / UPLOAD_CHUNK_SIZE_BYTES), 1);

  for (let offset = 0; offset < totalChunks; offset++) {
    const startByte = offset * UPLOAD_CHUNK_SIZE_BYTES;
    const nextBoundary = Math.min(sizeInBytes, startByte + UPLOAD_CHUNK_SIZE_BYTES);
    const isRemainderTooSmallForOwnChunk = sizeInBytes - nextBoundary < UPLOAD_CHUNK_SIZE_BYTES;
    const endByte = isRemainderTooSmallForOwnChunk ? sizeInBytes : nextBoundary;
    await uploadChunk({
      chunk: file.subarray(startByte, endByte),
      chunkNumber: offset + 1,
      totalChunks,
      totalSize: sizeInBytes,
      zipName,
      fileId,
      onRateLimit
    });
  }
}

async function verifyUploadSuccessful({
  zipPath,
  packageId,
  lastVersion,
  onRateLimit
}: {
  zipPath: string;
  packageId: number;
  lastVersion: string;
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
    onRateLimit,
    maxRetries: 30,
    maxBackoffMs: 30_000
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
  onRateLimit
}: {
  zip: string;
  packageId: number;
  changelog: string;
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
    onRateLimit
  });
}

function getVersions({
  packageId,
  onRateLimit
}: {
  packageId: number;
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
    onRateLimit
  });
}

export async function deployToOpera(
  {
    sessionid, csrftoken, packageId, zip, changelog = ""
  }: OperaOptions,
  {
    logger, onCredentialsExpired, setStatus, setExtensionName
  }: DeployContext = {}
) {
  httpClient = createOperaHttpClient({ sessionid, csrftoken }, logger, onCredentialsExpired);

  const onRateLimit = createRateLimitHandler({
    manualDeployUrl: `https://addons.opera.com/developer/package/${packageId}/`,
    formatError: storeError,
    logger
  });

  const { name, version } = await getExtJson(zip);
  setExtensionName?.(name);

  logger?.info("Checking versions");
  const versionsData = await getVersions({
    packageId,
    onRateLimit
  });
  const isVersionAlreadyDeployed = versionsData.versions.some(entry => entry.version === version && entry.submitted_for_moderation);
  if (isVersionAlreadyDeployed) {
    throw new Error(storeError(`Version ${version} has already been deployed`));
  }

  await cancelLatestVersionIfNotSubmitted({
    packageId,
    versionsListed: versionsData.versions,
    logger,
    onRateLimit
  });

  logger?.info("Uploading ZIP");
  await uploadZip({
    zip,
    onRateLimit
  });

  logger?.info("Verifying upload");
  const lastVersion = versionsData.versions.find(entry => entry.submitted_for_moderation)?.version || "";
  await verifyUploadSuccessful({
    zipPath: zip,
    packageId,
    lastVersion,
    onRateLimit
  });

  logger?.info("Verifying source code");
  await verifySourceCodeExistence({
    zip,
    packageId,
    lastVersion,
    onRateLimit
  });

  if (changelog) {
    logger?.info("Updating changelog");
    await updateChangelog({
      zip,
      packageId,
      changelog,
      onRateLimit
    });
  }

  logger?.info("Submitting for review");

  await submitChanges({
    zip,
    packageId,
    isAutoModerationAvailable: versionsData.available_auto_moderation,
    onRateLimit
  });

  setStatus?.(StoreStatus.Success);
  return true;
}
