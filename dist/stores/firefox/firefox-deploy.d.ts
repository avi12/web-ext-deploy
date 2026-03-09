import { type DeployContext } from "../../types.js";
import { FirefoxOptionsSubmissionApi } from "./firefox-input.js";
export declare function deployToFirefox({ extId, jwtIssuer, jwtSecret, zip, zipSource, changelog, changelogLang, devChangelog }: FirefoxOptionsSubmissionApi, { logger, isVerbose, setStatus, setZipPath }?: DeployContext): Promise<boolean>;
//# sourceMappingURL=firefox-deploy.d.ts.map