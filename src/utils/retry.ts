import type { StoreLogger } from "../types.js";
import { setTimeout } from "node:timers/promises";
import { ZodError } from "zod";

function getBackoffDelayMs(attempt: number, maxMs = 5_000) {
  return Math.min(2 ** attempt * 1000, maxMs);
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
    await (logger?.countdown?.(secondsToWait, remaining =>
      `Too many requests. Retrying in ${remaining}s\nOr, you can deploy manually: ${manualDeployUrl}`
    ) ?? setTimeout(secondsToWait * 1000));
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractApiMessage(data: unknown, statusText: string): string {
  if (typeof data === "string" && data) {
    return data;
  }
  if (!isRecord(data)) {
    return statusText;
  }
  if (isRecord(data.error)) {
    if (Array.isArray(data.error.details)) {
      const violations = data.error.details
        .filter(isRecord)
        .flatMap(detail => Array.isArray(detail.fieldViolations) ? detail.fieldViolations.filter(isRecord) : [])
        .map(violation => violation.description)
        .filter((description): description is string => typeof description === "string");
      if (violations.length > 0) {
        return violations.join("\n");
      }
    }
    if (typeof data.error.message === "string") {
      return data.error.message;
    }
  }
  if (typeof data.error === "string") {
    return data.error;
  }
  if (typeof data.message === "string") {
    return data.message;
  }
  if (typeof data.detail === "string") {
    return data.detail;
  }
  const messages = Object.values(data)
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");
  if (messages.length > 0) {
    return messages.join(", ");
  }
  return statusText;
}

const DEFAULT_MAX_RETRIES = 10;

export async function requestWithRetry<T>({
  sendRequest,
  parseResponse,
  formatError,
  errorContext,
  onRateLimit,
  maxRetries = DEFAULT_MAX_RETRIES,
  maxBackoffMs = 5_000
}: {
  sendRequest: () => Promise<HttpLikeResponse>;
  parseResponse: (response: HttpLikeResponse) => T;
  formatError: (message: string) => string;
  errorContext: string;
  onRateLimit?: (response: HttpLikeResponse) => Promise<void>;
  maxRetries?: number;
  maxBackoffMs?: number;
}): Promise<T> {
  async function attempt(count: number) {
    if (count > maxRetries) {
      throw new Error(formatError(`${errorContext}: Request failed after ${maxRetries} retries`));
    }
    const response = await sendRequest().catch((error: unknown): undefined => {
      if (error instanceof CookieAuthError) {
        throw error;
      }
      return undefined;
    });

    if (!response) {
      await setTimeout(getBackoffDelayMs(count, maxBackoffMs));
      return attempt(count + 1);
    }

    const isTooManyRetries = response.status === 429;
    if (isTooManyRetries) {
      if (onRateLimit) {
        await onRateLimit(response);
      } else {
        await setTimeout(getBackoffDelayMs(count, maxBackoffMs));
      }
      return attempt(count + 1);
    }

    const isClientError = response.status >= 400 && response.status < 500;
    if (isClientError) {
      const message = formatError(`${errorContext}: ${extractApiMessage(response.data, response.statusText)}`);
      throw new Error(message);
    }

    const IsServerError = response.status >= 500;
    if (IsServerError) {
      await setTimeout(getBackoffDelayMs(count, maxBackoffMs));
      return attempt(count + 1);
    }

    try {
      return parseResponse(response);
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map(issue => `${issue.path.join(".") || "response"}: ${issue.message}`).join(", ");
        throw new Error(formatError(`${errorContext}: Unexpected API response (${details})`), { cause: error });
      }
      throw error;
    }
  }

  return attempt(0);
}
