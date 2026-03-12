import { ReadStream } from "node:fs";

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
}

function stringifyParams(params: Record<string, string | number>) {
  const entries = Object.entries(params).map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(entries).toString();
}

const REQUEST_TIMEOUT_MS = 120_000;

async function fetchResponse(url: string, options: RequestInit) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const contentType = response.headers.get("content-type");
    const data: unknown =
      contentType && contentType.includes("application/json") ? await response.json() : await response.text();

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function createHttpClient(baseURL: string, defaultHeaders: Record<string, string> = {}) {
  function request(method: "GET" | "POST" | "PATCH", endpoint: string, options: FetchOptions = {}) {
    const base = `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
    const url = options.params ? `${base}?${stringifyParams(options.params)}` : base;

    const headers = {
      ...defaultHeaders,
      ...options.headers
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      ...options.body !== undefined && { body: options.body }
    };

    return fetchResponse(url, fetchOptions);
  }

  function post(endpoint: string, body?: BodyInit | ReadStream, options: FetchOptions = {}) {
    if (body instanceof ReadStream) {
      // Pass the stream directly to fetch (Node.js 18+); duplex: "half" is required
      // for request bodies that are streams so the connection stays half-open while
      // the server processes and responds.
      const fetchInit = {
        method: "POST" as const,
        headers: { ...defaultHeaders, ...options.headers },
        body: body as unknown as BodyInit,
        duplex: "half"
      };
      const base = `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
      return fetchResponse(base, fetchInit);
    }

    return request("POST", endpoint, { ...options, body });
  }

  function get(endpoint: string, options: FetchOptions = {}) {
    return request("GET", endpoint, options);
  }

  function patch(endpoint: string, body?: BodyInit, options: FetchOptions = {}) {
    return request("PATCH", endpoint, { ...options, body });
  }

  return { post, get, patch };
}
