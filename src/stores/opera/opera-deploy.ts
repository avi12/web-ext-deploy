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

    if (!onCredentialsExpired) {
      throw new CookieAuthError("Opera");
    }

    logger?.warning("Cookies expired, refreshing...");
    const freshCookies = await onCredentialsExpired();
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
  onRateLimit
}: {
  zip: string;
  packageId: number;
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
    onRateLimit
  });
}

async function submitChanges({
  zip,
  packageId,
  availableAutoModeration,
  onRateLimit
}: {
  zip: string;
  packageId: number;
  availableAutoModeration: boolean;
  onRateLimit?: RateLimitHandler;
}) {
  const extJson = await getExtJson(zip);
  const { version } = extJson;

  try {
    await requestWithRetry({
      sendRequest: () => httpClient.post(
        `developer/package-versions/${packageId}-${version}/submit_for_moderation/`,
        JSON.stringify({ auto_moderation: availableAutoModeration }),
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
  const zipNameWithoutForbiddenCharacters = zipName.replace(/[.]/g, "");
  const fileId = `${sizeInBytes}-${zipNameWithoutForbiddenCharacters}`;
  return { zipName, fileId };
}

async function uploadZip({
  zip,
  onRateLimit
}: {
  zip: string;
  onRateLimit?: RateLimitHandler;
}) {
  const { zipName, fileId } = getFileMetadata(zip);

  const formData = buildFormData([
    { name: "flowChunkNumber", value: "1" },
    { name: "flowFilename", value: zipName },
    { name: "flowIdentifier", value: fileId },
    { name: "file", value: fs.createReadStream(zip), filename: zipName }
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
    logger, onCredentialsExpired, isVerbose, setStatus, setZipPath
  }: DeployContext = {}
) {
  httpClient = createOperaHttpClient({ sessionid, csrftoken }, logger, onCredentialsExpired);

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
    onRateLimit
  });
  if (versionsData.versions.some(entry => entry.version === version && entry.submitted_for_moderation)) {
    throw new Error(storeError(`Version ${version} has already been deployed`));
  }

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
    onRateLimit
  });

  if (isVerbose) {
    logger?.info("Verifying source code existence");
  }

  await verifySourceCodeExistence({
    zip,
    packageId,
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
      onRateLimit
    });
  }

  if (isVerbose) {
    logger?.info("Submitting changes");
  }

  await submitChanges({
    zip,
    packageId,
    availableAutoModeration: versionsData.available_auto_moderation,
    onRateLimit
  });

  setStatus?.(StoreStatus.Success);
  return true;
}
