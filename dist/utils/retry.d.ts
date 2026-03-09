import type { StoreLogger } from "../types.js";
export declare function toError(value: unknown): Error;
export declare class CookieAuthError extends Error {
    constructor(store: string);
}
export type HttpLikeResponse = {
    data: unknown;
    status: number;
    statusText: string;
    headers?: Record<string, string>;
};
export type RateLimitHandler = (response: HttpLikeResponse) => Promise<void>;
export declare function createRateLimitHandler({ manualDeployUrl, formatError, logger, maxWaitSeconds, getWaitSeconds }: {
    manualDeployUrl: string;
    formatError: (message: string) => string;
    logger?: StoreLogger;
    maxWaitSeconds?: number;
    getWaitSeconds?: (response: HttpLikeResponse) => number;
}): (response: HttpLikeResponse) => Promise<void>;
export declare function requestWithRetry<T>({ sendRequest, parseResponse, formatError, errorContext, onRateLimit, maxRetries, maxBackoffMs }: {
    sendRequest: () => Promise<HttpLikeResponse>;
    parseResponse: (response: HttpLikeResponse) => T;
    formatError: (message: string) => string;
    errorContext: string;
    onRateLimit?: (response: HttpLikeResponse) => Promise<void>;
    maxRetries?: number;
    maxBackoffMs?: number;
}): Promise<T>;
//# sourceMappingURL=retry.d.ts.map