import { type DeployContext } from "../../types.js";
import { EdgeOptionsPublishApi } from "./edge-input.js";
export declare function deployToEdgePublishApi({ productId, clientId, apiKey, zip, devChangelog }: EdgeOptionsPublishApi, { logger, isVerbose, setStatus, setZipPath }?: DeployContext): Promise<boolean>;
//# sourceMappingURL=edge-deploy.d.ts.map