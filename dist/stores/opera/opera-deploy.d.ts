import { type DeployContext } from "../../types.js";
import { OperaOptions } from "./opera-input.js";
export declare function deployToOpera({ sessionid, csrftoken, packageId, zip, changelog }: OperaOptions, { logger, onCookieExpired, isVerbose, setStatus, setZipPath }?: DeployContext): Promise<boolean>;
//# sourceMappingURL=opera-deploy.d.ts.map