import { ReadStream } from "node:fs";

// duplex: "half" is required by the Fetch spec for streaming request bodies
// (the connection stays half-open while the server reads and responds).
// Node.js 18+ supports it but TypeScript's lib.dom.d.ts omits the field.
declare global {
  interface RequestInit {
    duplex?: "half";
  }
}

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
      headers: Object.fromEntries(response.headers.entries()),
      setCookies: response.headers.getSetCookie?.() ?? []
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function createHttpClient(baseURL: string, defaultHeaders: Record<string, string> = {}) {
  function buildUrl(endpoint: string, params?: Record<string, string | number>) {
    const base = `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
    return params ? `${base}?${stringifyParams(params)}` : base;
  }

  function request(method: "GET" | "POST" | "PATCH", endpoint: string, options: FetchOptions = {}) {
    const fetchOptions: RequestInit = {
      method,
      headers: { ...defaultHeaders, ...options.headers },
      ...options.body !== undefined && { body: options.body }
    };

    return fetchResponse(buildUrl(endpoint, options.params), fetchOptions);
  }

  return {
    post(endpoint: string, body?: BodyInit | ReadStream, options: FetchOptions = {}) {
      if (body instanceof ReadStream) {
        // new ReadableStream(underlyingSource) is typed as ReadableStream<any>, which is
        // part of BodyInit — no type assertion needed. duplex: "half" tells fetch to keep
        // the connection open for sending while waiting for the response.
        return fetchResponse(buildUrl(endpoint), {
          method: "POST",
          headers: { ...defaultHeaders, ...options.headers },
          body: new ReadableStream({
            start(controller) {
              body.on("data", chunk => controller.enqueue(chunk));
              body.on("end", () => controller.close());
              body.on("error", error => controller.error(error));
            },
            cancel() {
              body.destroy();
            }
          }),
          duplex: "half"
        });
      }

      return request("POST", endpoint, { ...options, body });
    },
    get(endpoint: string, options: FetchOptions = {}) {
      return request("GET", endpoint, options);
    },
    patch(endpoint: string, body?: BodyInit, options: FetchOptions = {}) {
      return request("PATCH", endpoint, { ...options, body });
    }
  };
}
