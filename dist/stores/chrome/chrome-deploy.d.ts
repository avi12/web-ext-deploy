import { type DeployContext } from "../../types.js";
import { ChromeOptions } from "./chrome-input.js";
export declare function deployToChrome({ extId, publisherId, clientId, clientSecret, refreshToken, zip, skipReview, deployPercentage }: ChromeOptions, { logger, isVerbose, setStatus, setZipPath }?: DeployContext): Promise<boolean>;
//# sourceMappingURL=chrome-deploy.d.ts.map