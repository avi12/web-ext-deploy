import { setTimeout } from "node:timers/promises";

import { z, ZodError } from "zod";

import type { StoreLogger } from "@/types.js";

import { isError, isString } from "./guards.js";
import { createGuard } from "./zod-guard.js";

const DEFAULT_MAX_BACKOFF_MS = 5_000;
const MS_PER_SECOND = 1000;
const DEFAULT_MAX_WAIT_SECONDS = 60;

export function getBackoffDelayMs({ attempt, maxMs = DEFAULT_MAX_BACKOFF_MS }: { attempt: number; maxMs?: number }) {
  return Math.min(2 ** attempt * MS_PER_SECOND, maxMs);
}

export function toError(value: unknown) {
  return isError(value) ? value : new Error(String(value));
}

export class CookieAuthError extends Error {
  constructor(store: string) {
    super(`${store}: Authentication failed - cookies may be expired`);
    this.name = "CookieAuthError";
  }
}

const isCookieAuthError = createGuard(z.instanceof(CookieAuthError));
const isZodError = createGuard(z.instanceof(ZodError));

export interface HttpLikeResponse {
  data: unknown;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  setCookies?: string[];
}

export type RateLimitHandler = (response: HttpLikeResponse) => Promise<void>;

export function createRateLimitHandler({
  manualDeployUrl,
  formatError,
  logger,
  maxWaitSeconds = DEFAULT_MAX_WAIT_SECONDS,
  getWaitSeconds = () => DEFAULT_MAX_WAIT_SECONDS
}: {
  manualDeployUrl: string;
  formatError: (message: string) => string;
  logger?: StoreLogger;
  maxWaitSeconds?: number;
  getWaitSeconds?: (response: HttpLikeResponse) => number;
}) {
  return (async response => {
    const secondsToWait = getWaitSeconds(response);
    if (secondsToWait > maxWaitSeconds) {
      throw new Error(formatError(`Too many API requests. Deploy manually at ${manualDeployUrl}`));
    }

    if (logger?.countdown) {
      await logger.countdown(
        secondsToWait,
        remaining => `Too many requests. Retrying in ${remaining}s\nOr, you can deploy manually: ${manualDeployUrl}`
      );
    } else {
      await setTimeout(secondsToWait * MS_PER_SECOND);
    }
  }) satisfies RateLimitHandler;
}

const recordSchema = z.record(z.string(), z.unknown());

const FieldViolationSchema = z.object({ description: z.string() });
const ViolationDetailSchema = z.object({ fieldViolations: z.array(FieldViolationSchema).optional() });
const GoogleViolationsSchema = z.object({ error: z.object({ details: z.array(ViolationDetailSchema) }) });

const ErrorMessageSchema = z.object({ error: z.object({ message: z.string() }) });
const ErrorStringSchema = z.object({ error: z.string() });
const MessageSchema = z.object({ message: z.string() });
const DetailSchema = z.object({ detail: z.string() });

function extractApiMessage({ data, statusText }: { data: unknown; statusText: string }) {
  const asString = z.string().min(1).safeParse(data).data;
  if (asString) {
    return asString;
  }

  const violations = GoogleViolationsSchema.safeParse(data)
    .data?.error.details.flatMap(detail => detail.fieldViolations ?? [])
    .map(violation => violation.description);
  if (violations?.length) {
    return violations.join("\n");
  }

  const withErrorMessage = ErrorMessageSchema.safeParse(data).data;
  if (withErrorMessage) {
    return withErrorMessage.error.message;
  }

  const withErrorString = ErrorStringSchema.safeParse(data).data;
  if (withErrorString) {
    return withErrorString.error;
  }

  const withMessage = MessageSchema.safeParse(data).data;
  if (withMessage) {
    return withMessage.message;
  }

  const withDetail = DetailSchema.safeParse(data).data;
  if (withDetail) {
    return withDetail.detail;
  }

  const record = recordSchema.safeParse(data).data;
  if (record) {
    const messages = Object.values(record)
      .flatMap(value => (Array.isArray(value) ? value : [value]))
      .filter(isString);
    if (messages.length > 0) {
      return messages.join(", ");
    }

    const rawJson = JSON.stringify(record);
    if (rawJson !== "{}") {
      return rawJson;
    }
  }

  const serialized = JSON.stringify(data);
  const isNonEmptyObject = Boolean(serialized) && serialized !== "{}";
  if (isNonEmptyObject) {
    return `${statusText}: ${serialized}`;
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
  acceptedClientErrorStatuses = [],
  maxRetries = DEFAULT_MAX_RETRIES,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS
}: {
  sendRequest: () => Promise<HttpLikeResponse>;
  parseResponse: (response: HttpLikeResponse) => T;
  formatError: (message: string) => string;
  errorContext: string;
  onRateLimit?: (response: HttpLikeResponse) => Promise<void>;
  acceptedClientErrorStatuses?: number[];
  maxRetries?: number;
  maxBackoffMs?: number;
}) {
  async function attempt(count: number) {
    if (count > maxRetries) {
      throw new Error(formatError(`${errorContext}: Request failed after ${maxRetries} retries`));
    }

    let response: HttpLikeResponse | undefined;
    try {
      response = await sendRequest();
    } catch (error) {
      if (isCookieAuthError(error)) {
        throw error;
      }
    }

    if (!response) {
      await setTimeout(
        getBackoffDelayMs({
          attempt: count,
          maxMs: maxBackoffMs
        })
      );
      return attempt(count + 1);
    }

    const isTooManyRequests = response.status === 429;
    if (isTooManyRequests) {
      await (onRateLimit
        ? onRateLimit(response)
        : setTimeout(
            getBackoffDelayMs({
              attempt: count,
              maxMs: maxBackoffMs
            })
          ));
      return attempt(count + 1);
    }

    const isClientError =
      response.status >= 400 && response.status < 500 && !acceptedClientErrorStatuses.includes(response.status);
    if (isClientError) {
      throw new Error(
        formatError(
          `${errorContext}: ${extractApiMessage({
            data: response.data,
            statusText: response.statusText
          })}`
        )
      );
    }

    const isServerError = response.status >= 500;
    if (isServerError) {
      await setTimeout(
        getBackoffDelayMs({
          attempt: count,
          maxMs: maxBackoffMs
        })
      );
      return attempt(count + 1);
    }

    try {
      return parseResponse(response);
    } catch (error) {
      if (!isZodError(error)) {
        throw error;
      }

      const details = error.issues.map(issue => `${issue.path.join(".") || "response"}: ${issue.message}`).join(", ");
      throw new Error(formatError(`${errorContext}: Unexpected API response (${details})`), { cause: error });
    }
  }

  return attempt(0);
}
