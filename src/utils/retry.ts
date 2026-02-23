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
      const message = formatError(`${errorContext}: ${response.statusText}`);
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
