import Axios, { type AxiosInstance, type AxiosResponse } from "axios";
import { backOff } from "exponential-backoff";
import FormData from "form-data";
import { OperaOptions } from "./opera-input.js";
import { CancelChanges, ListingDetail, ListVersions, SubmitChanges, UploadResult } from "./opera-types.js";
import type { SupportedStoresCapitalized } from "../../types.js";
import { getErrorMessage, getExtJson, getVerboseMessage, logSuccessfullyPublished } from "../../utils.js";
import fs from "fs";

const STORE: SupportedStoresCapitalized = "Opera";
let axios: AxiosInstance;

async function handleRequestWithBackOff<T>({
  sendRequest,
  errorActionOnFailure,
  zip
}: {
  sendRequest: () => Promise<AxiosResponse<T>>;
  errorActionOnFailure: string;
  zip: string;
}): Promise<[string] | [undefined, T]> {
  while (true) {
    try {
      const { data } = await sendRequest();
      return [undefined, data];
    } catch (e) {
      const isServerError = e.response.status >= 500;
      if (isServerError) {
        await backOff(() => Promise.resolve(), { maxDelay: 30_000, delayFirstAttempt: true, jitter: "full" });
        continue;
      }

      // A client error
      return [
        getErrorMessage({
          store: STORE,
          error: e.response.statusText,
          actionName: errorActionOnFailure,
          zip
        })
      ];
    }
  }
}

async function verifySourceCodeExistence({
  zip,
  packageId
}: {
  zip: string;
  packageId: number;
}): Promise<[undefined, boolean] | [string]> {
  const { version, default_locale = "en" } = getExtJson(zip);
  const sendRequest = async () => axios<ListingDetail>(`developer/package-versions/${packageId}-${version}/`);
  const params = new URLSearchParams({ language: default_locale });
  const url = `https://addons.opera.com/developer/package/${packageId}/version/${version}?${params}`;
  const errorMessage = `No source code provided. Provide a URL in ${url} and submit the changes`;
  const [error, data] = await handleRequestWithBackOff<ListingDetail>({
    zip,
    sendRequest,
    errorActionOnFailure: "verify source code existence of"
  });
  if (error) {
    return [error];
  }
  const isSourceCodeProvided = Boolean(data.source_url || data.source_for_moderators_url);
  if (isSourceCodeProvided) {
    return [undefined, isSourceCodeProvided];
  }
  return [errorMessage];
}

async function cancelLatestVersionIfNotSubmitted({
  packageId,
  versionsListed,
  isVerbose,
  zip
}: {
  packageId: number;
  versionsListed: ListVersions["versions"];
  isVerbose: boolean;
  zip: string;
}): Promise<[undefined, CancelChanges] | [string]> {
  if (versionsListed.length === 0 || versionsListed[0].submitted_for_moderation) {
    return [undefined];
  }
  const { version } = versionsListed[0];
  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: `Canceling unsubmitted version ${version}` }));
  }

  const sendRequest = async () => {
    return axios.post<CancelChanges>(`developer/package-versions/${packageId}-${version}/cancel_changes/`);
  };

  return handleRequestWithBackOff<CancelChanges>({
    zip,
    sendRequest,
    errorActionOnFailure: "cancel unsubmitted changes of"
  });
}

async function submitChanges({ zip, packageId }: { zip: string; packageId: number }) {
  const { version } = getExtJson(zip);
  const sendRequest = async () =>
    axios.post<SubmitChanges>(`developer/package-versions/${packageId}-${version}/submit_for_moderation/`);
  return handleRequestWithBackOff<SubmitChanges>({
    zip,
    sendRequest,
    errorActionOnFailure: "submit changes to"
  });
}

function getFileMetadata(zipPath: string) {
  const sizeInBytes = fs.statSync(zipPath).size;
  const zipName = zipPath.split(/[\\/]/).pop();
  const zipNameWithoutForbiddenCharacters = zipName.replace(/[.]/g, "");
  const fileId = `${sizeInBytes}-${zipNameWithoutForbiddenCharacters}`;
  return { zipName, fileId };
}

async function uploadZip({ zip }: { zip: string }) {
  const { zipName, fileId } = getFileMetadata(zip);

  const formData = new FormData();
  formData.append("flowChunkNumber", 1);
  formData.append("flowFilename", zipName);
  formData.append("flowIdentifier", fileId);
  formData.append("file", fs.createReadStream(zip));

  const sendRequest = async () => axios.post("file-upload/", formData);

  return handleRequestWithBackOff({ zip, sendRequest, errorActionOnFailure: "upload zip for" });
}

async function verifyUploadSuccessful({
  zipPath,
  packageId,
  lastVersion
}: {
  zipPath: string;
  packageId: number;
  lastVersion: string;
}): Promise<[undefined, UploadResult] | [string]> {
  const { zipName, fileId } = getFileMetadata(zipPath);

  const sendRequest = async () =>
    axios.post<UploadResult>(
      "developer/package-versions/",
      {
        file_id: fileId,
        file_name: zipName,
        metadata_from: lastVersion
      },
      {
        params: {
          package_id: packageId
        }
      }
    );
  const [error, data] = await handleRequestWithBackOff<UploadResult>({
    zip: zipPath,
    sendRequest,
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
  const { version, default_locale = "en" } = getExtJson(zip);
  const sendRequest = async () =>
    axios.patch<ListingDetail>(`developer/package-versions/${packageId}-${version}/`, {
      translations: {
        [default_locale]: {
          changelog
        }
      }
    });
  return handleRequestWithBackOff<ListingDetail>({ zip, sendRequest, errorActionOnFailure: "update changelog of" });
}

function verifyVersionNotSubmittedForModeration({
  zip,
  versionsListed
}: {
  zip: string;
  versionsListed: ListVersions["versions"];
}): [string | undefined] {
  const { version } = getExtJson(zip);
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
  const sendRequest = async () => axios<ListVersions>(`developer/packages/${packageId}/`);
  return handleRequestWithBackOff<ListVersions>({
    zip,
    sendRequest,
    errorActionOnFailure: "get all package versions of"
  });
}

export default async function deployToOpera({
  sessionid,
  csrftoken,
  packageId,
  zip,
  changelog = "",
  verbose: isVerbose
}: OperaOptions): Promise<boolean> {
  axios = Axios.create({
    baseURL: `https://addons.opera.com/api/`,
    headers: {
      Accept: "application/json; version=1.0",
      Cookie: `csrftoken=${csrftoken}; sessionid=${sessionid}`,
      "X-Csrftoken": csrftoken,
      Referer: "https://addons.opera.com"
    }
  });

  const { name, version } = getExtJson(zip);

  if (isVerbose) {
    console.log(
      getVerboseMessage({
        store: STORE,
        message: `Retrieving listed versions of ${name} with package ID ${packageId}`
      })
    );
  }

  // eslint-disable-next-line prefer-const
  let [error, data] = await getVersions({ zip, packageId });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: `Verifying version ${version}` }));
  }

  [error] = verifyVersionNotSubmittedForModeration({ zip, versionsListed: data.versions });
  if (error) {
    throw error;
  }

  [error] = await cancelLatestVersionIfNotSubmitted({ zip, packageId, versionsListed: data.versions, isVerbose });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: "Uploading zip" }));
  }

  [error] = await uploadZip({ zip });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: "Verifying upload" }));
  }

  const lastVersion = data.versions.find(version => version.submitted_for_moderation)?.version || "";
  [error] = await verifyUploadSuccessful({ zipPath: zip, packageId, lastVersion });
  if (error) {
    throw error;
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: "Verifying source code existence" }));
  }

  [error] = await verifySourceCodeExistence({ zip, packageId });
  if (error) {
    throw error;
  }

  if (changelog) {
    if (isVerbose) {
      console.log(getVerboseMessage({ store: STORE, message: "Updating changelog" }));
    }
    [error] = await updateChangelog({ zip, packageId, changelog });
    if (error) {
      throw error;
    }
  }

  if (isVerbose) {
    console.log(getVerboseMessage({ store: STORE, message: "Submitting changes" }));
  }

  [error] = await submitChanges({ zip, packageId });
  if (error) {
    throw error;
  }

  logSuccessfullyPublished({ extId: packageId, store: STORE, zip });
  return true;
}
