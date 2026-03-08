import type { StoreLogger } from "../types.js";
import { setTimeout } from "node:timers/promises";

function getBackoffDelayMs(attempt: number) {
  return Math.min(2 ** attempt, 5) * 1000;
}

export function toError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}

export class CookieAuthError extends Error {
  constructor(store: string) {
    super(`${store}: Authentication failed - cookies may be expired`);
    this.name = "CookieAuthError";
  }
}

export type HttpLikeResponse = {
  data: unknown;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
};

export type RateLimitHandler = (response: HttpLikeResponse) => Promise<void>;

export function createRateLimitHandler({
  manualDeployUrl,
  formatError,
  logger,
  maxWaitSeconds = 60,
  getWaitSeconds = () => 60
}: {
  manualDeployUrl: string;
  formatError: (message: string) => string;
  logger?: StoreLogger;
  maxWaitSeconds?: number;
  getWaitSeconds?: (response: HttpLikeResponse) => number;
}): RateLimitHandler {
  return async response => {
    const secondsToWait = getWaitSeconds(response);
    if (secondsToWait > maxWaitSeconds) {
      throw new Error(formatError(`Too many API requests. Deploy manually at ${manualDeployUrl}`));
    }
    const retryAt = new Date(Date.now() + secondsToWait * 1000).toLocaleTimeString();
    logger?.warning(`Too many requests. A retry will automatically be at ${retryAt}\nOr, you can deploy manually: ${manualDeployUrl}`);
    await setTimeout(secondsToWait * 1000);
  };
}

export async function requestWithRetry<T>({
  sendRequest,
  parseResponse,
  formatError,
  errorContext,
  logger,
  onRateLimit
}: {
  sendRequest: () => Promise<HttpLikeResponse>;
  parseResponse: (response: HttpLikeResponse) => T;
  formatError: (message: string) => string;
  errorContext: string;
  logger?: StoreLogger;
  onRateLimit?: (response: HttpLikeResponse) => Promise<void>;
}): Promise<T> {
  async function attempt(count: number) {
    const response = await sendRequest().catch((error: unknown): undefined => {
      if (error instanceof CookieAuthError) {
        throw error;
      }
      return undefined;
    });

    if (!response) {
      await setTimeout(getBackoffDelayMs(count));
      return attempt(count + 1);
    }

    const isTooManyRetries = response.status === 429;
    if (isTooManyRetries) {
      if (onRateLimit) {
        await onRateLimit(response);
      } else {
        await setTimeout(getBackoffDelayMs(count));
      }
      return attempt(count + 1);
    }

    const isClientError = response.status >= 400 && response.status < 500;
    if (isClientError) {
      const apiMessage =
        response.data !== null &&
        typeof response.data === "object" &&
        "error" in response.data &&
        typeof (response.data as { error: unknown }).error === "object" &&
        (response.data as { error: { message?: unknown } }).error.message
          ? String((response.data as { error: { message: unknown } }).error.message)
          : response.statusText;
      const message = formatError(`${errorContext}: ${apiMessage}`);
      logger?.error(message);
      throw new Error(message);
    }

    const IsServerError = response.status >= 500;
    if (IsServerError) {
      await setTimeout(getBackoffDelayMs(count));
      return attempt(count + 1);
    }

    return parseResponse(response);
  }

  return attempt(0);
}
