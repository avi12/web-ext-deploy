import { createHttpClient } from "../../http/client.js";
import { StoreStatus } from "../../types.js";
import { storeError } from "../../ui/logging.js";
import { createRateLimitHandler, requestWithRetry } from "../../utils/retry.js";
import { FetchStatusSchema, ItemState, PublishResponseSchema, UploadResponseSchema, UploadState } from "./chrome-types.js";
import fs from "node:fs";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
const AccessTokenResponseSchema = z.object({
    access_token: z.string(),
    token_type: z.literal("Bearer")
});
async function exchangeRefreshTokenForAccessToken(clientId, clientSecret, refreshToken) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
        })
    });
    const result = AccessTokenResponseSchema.safeParse(await response.json());
    if (!result.success) {
        throw new Error(storeError("Failed to exchange refresh token for access token"));
    }
    return result.data.access_token;
}
let httpClient;
const PENDING_REVIEW_STATES = [ItemState.PENDING_REVIEW, ItemState.STAGED];
/** @see https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus */
function fetchStatus({ extId, publisherId, onRateLimit }) {
    return requestWithRetry({
        sendRequest: () => httpClient.get(`v2/publishers/${publisherId}/items/${extId}:fetchStatus`),
        parseResponse(response) {
            const result = FetchStatusSchema.safeParse(response.data);
            if (!result.success) {
                throw result.error;
            }
            return result.data;
        },
        formatError: storeError,
        errorContext: "Fetch status failed",
        onRateLimit
    });
}
/** @see https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/cancelSubmission */
async function cancelSubmissionIfPending({ extId, publisherId, logger, isVerbose, onRateLimit }) {
    const status = await fetchStatus({ extId, publisherId, onRateLimit });
    const submittedState = status.submittedItemRevisionStatus?.state;
    if (!submittedState || !PENDING_REVIEW_STATES.includes(submittedState)) {
        return;
    }
    if (isVerbose) {
        logger?.info(`Canceling pending submission (state: ${submittedState})`);
    }
    await requestWithRetry({
        sendRequest: () => httpClient.post(`v2/publishers/${publisherId}/items/${extId}:cancelSubmission`),
        parseResponse: () => undefined,
        formatError: storeError,
        errorContext: "Cancel submission failed",
        onRateLimit
    });
    await setTimeout(60_000);
}
/** @see https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus */
async function waitForUpload({ extId, publisherId, onRateLimit }) {
    const pollIntervalMs = 5_000;
    let lastAsyncUploadState;
    while (true) {
        const data = await requestWithRetry({
            sendRequest: () => httpClient.get(`v2/publishers/${publisherId}/items/${extId}:fetchStatus`),
            parseResponse(response) {
                const result = FetchStatusSchema.safeParse(response.data);
                if (!result.success) {
                    throw result.error;
                }
                return result.data;
            },
            formatError: storeError,
            errorContext: "Upload status check failed",
            onRateLimit
        });
        lastAsyncUploadState = data.lastAsyncUploadState;
        if (lastAsyncUploadState !== UploadState.IN_PROGRESS) {
            break;
        }
        await setTimeout(pollIntervalMs);
    }
    if (lastAsyncUploadState !== UploadState.SUCCEEDED) {
        throw new Error(storeError(`Upload failed with state: ${lastAsyncUploadState}`));
    }
}
/** @see https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload */
async function uploadZip({ zip, extId, publisherId, onRateLimit }) {
    const data = await requestWithRetry({
        sendRequest: () => httpClient.post(`upload/v2/publishers/${publisherId}/items/${extId}:upload`, fs.createReadStream(zip), { headers: { "Content-Type": "application/zip" } }),
        parseResponse(response) {
            const result = UploadResponseSchema.safeParse(response.data);
            if (!result.success) {
                throw result.error;
            }
            return result.data;
        },
        formatError: storeError,
        errorContext: "Upload failed",
        onRateLimit
    });
    if (data.uploadState === UploadState.SUCCEEDED) {
        return;
    }
    if (data.uploadState === UploadState.IN_PROGRESS) {
        return waitForUpload({ extId, publisherId, onRateLimit });
    }
    throw new Error(storeError(`Upload failed with state: ${data.uploadState}`));
}
const PUBLISH_SUCCESS_STATES = [ItemState.PENDING_REVIEW, ItemState.STAGED, ItemState.PUBLISHED, ItemState.PUBLISHED_TO_TESTERS];
/** @see https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish */
async function publishExtension({ extId, publisherId, skipReview, deployPercentage, onRateLimit }) {
    const body = {
        ...skipReview && { skipReview: true },
        ...deployPercentage !== undefined && { deployInfos: [{ deployPercentage }] }
    };
    const data = await requestWithRetry({
        sendRequest: () => httpClient.post(`v2/publishers/${publisherId}/items/${extId}:publish`, JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
        parseResponse(response) {
            const result = PublishResponseSchema.safeParse(response.data);
            if (!result.success) {
                throw result.error;
            }
            return result.data;
        },
        formatError: storeError,
        errorContext: "Publish failed",
        onRateLimit
    });
    const { state } = data;
    if (!PUBLISH_SUCCESS_STATES.includes(state)) {
        throw new Error(storeError(`Publish failed with state: ${state}`));
    }
}
async function verifySubmission({ extId, publisherId, onRateLimit }) {
    const status = await fetchStatus({
        extId,
        publisherId,
        onRateLimit
    });
    const submittedState = status.submittedItemRevisionStatus?.state;
    const publishedState = status.publishedItemRevisionStatus?.state;
    if (publishedState === ItemState.PUBLISHED || publishedState === ItemState.PUBLISHED_TO_TESTERS) {
        return;
    }
    if (submittedState && PUBLISH_SUCCESS_STATES.includes(submittedState)) {
        return;
    }
    const state = submittedState || publishedState || "unknown";
    throw new Error(storeError(`Submission verification failed (state: ${state})`));
}
export async function deployToChrome({ extId, publisherId, clientId, clientSecret, refreshToken, zip, skipReview, deployPercentage }, { logger, isVerbose, setStatus, setZipPath } = {}) {
    setZipPath?.(zip);
    const accessToken = await exchangeRefreshTokenForAccessToken(clientId, clientSecret, refreshToken);
    httpClient = createHttpClient("https://chromewebstore.googleapis.com", { Authorization: `Bearer ${accessToken}` });
    const onRateLimit = createRateLimitHandler({
        manualDeployUrl: `https://chrome.google.com/webstore/devconsole/${publisherId}/${extId}/edit/package`,
        formatError: storeError,
        logger
    });
    await cancelSubmissionIfPending({
        extId, publisherId, logger, isVerbose, onRateLimit
    });
    if (isVerbose) {
        logger?.info(`Uploading zip with extension ID ${extId}`);
    }
    await uploadZip({
        zip,
        extId,
        publisherId,
        onRateLimit
    });
    if (isVerbose) {
        logger?.info("Publishing extension");
    }
    await publishExtension({
        extId, publisherId, skipReview, deployPercentage, onRateLimit
    });
    if (isVerbose) {
        logger?.info("Verifying submission");
    }
    await verifySubmission({ extId, publisherId, onRateLimit });
    setStatus?.(StoreStatus.Success);
    return true;
}
