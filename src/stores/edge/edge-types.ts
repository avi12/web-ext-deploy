// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference#check-the-publishing-status

interface CreateNotAllowedPublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "Can't create new extension.";
  errorCode: "CreateNotAllowed";
  errors: null;
}

interface NoModulesUpdatedPublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "Can't publish extension since there are no updates, please try again after updating the package.";
  errorCode: "NoModulesUpdated";
  errors: null;
}

interface InProgressSubmissionPublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "Can't publish extension as your extension submission is in progress. Please try again later.";
  errorCode: "InProgressSubmission";
  errors: null;
}

interface UnpublishInProgressPublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "Can't publish extension as your extension is being unpublished. Please try after you unpublished.";
  errorCode: "UnpublishInProgress";
  errors: null;
}

interface ModuleStateUnPublishablePublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "Can't publish extension as your extension has modules that are not valid. Fix the modules with errors and try to publish again.";
  errorCode: "ModuleStateUnPublishable";
  errors: Array<{ message: `Invalid module : ${string}` }>;
}

interface SubmissionValidationErrorPublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "Extension can't be published as there are submission validation failures. Fix these errors and try again later.";
  errorCode: "SubmissionValidationError";
  errors: Array<{ message: string }>;
}

export interface SuccessPublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Succeeded";
  message: `Successfully created submission with extension ID ${string}`;
  errorCode: "";
  errors: null;
}

interface IrrecoverableFailurePublishStatus {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: "An error occurred while performing the operation";
  errorCode: null;
  errors: null;
}

interface UnexpectedFailurePublishStatus {
  id: string;
  message: `An error occurred while processing the request. Please contact support Correlation ID: ${string} Timestamp: ${string}`;
}

export type PublishOperationStatus =
  | CreateNotAllowedPublishStatus
  | NoModulesUpdatedPublishStatus
  | InProgressSubmissionPublishStatus
  | UnpublishInProgressPublishStatus
  | ModuleStateUnPublishablePublishStatus
  | SubmissionValidationErrorPublishStatus
  | SuccessPublishStatus
  | IrrecoverableFailurePublishStatus
  | UnexpectedFailurePublishStatus;

// https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/addons-api-reference#check-the-status-of-a-package-upload

interface InProgressStatusPackageUpload {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "InProgress";
  message: null;
  errorCode: null;
  errors: null;
}

interface SuccessStatusPackageUpload {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Succeeded";
  message: `Successfully updated package to ${string}.zip`;
  errorCode: "";
  errors: null;
}

interface IrrecoverableFailureStatusPackageUpload {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: "Failed";
  message: string;
  errorCode: null;
  errors: Array<{ message: string }>;
}

export type StatusPackageUpload = InProgressStatusPackageUpload | SuccessStatusPackageUpload | IrrecoverableFailureStatusPackageUpload;
