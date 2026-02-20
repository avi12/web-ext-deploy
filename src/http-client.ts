type RequestMethod = "GET" | "POST" | "PATCH";

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
}

interface HttpResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
}

import { ReadStream } from "node:fs";

async function streamToBuffer(stream: ReadStream) {
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      const buf = Buffer.concat(chunks);
      const arrayBuffer = new ArrayBuffer(buf.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(buf);
      resolve(view);
    });
    stream.on("error", reject);
  });
}

function stringifyParams(params: Record<string, string | number>) {
  const entries = Object.entries(params).map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(entries).toString();
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  delayMs: number = 1000
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status >= 500 && attempt < maxRetries) {
        lastError = new Error(`Server error ${response.status}: ${response.statusText}`);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        continue;
      }

      const contentType = response.headers.get("content-type");
      const data: unknown =
        contentType && contentType.includes("application/json") ? await response.json() : await response.text();

      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}

export function createHttpClient(baseURL: string, defaultHeaders: Record<string, string> = {}) {
  async function request(method: RequestMethod, endpoint: string, options: FetchOptions = {}) {
    let url = `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;

    if (options.params) {
      url += `?${stringifyParams(options.params)}`;
    }

    const headers = { ...defaultHeaders,
      ...options.headers };

    const fetchOptions: RequestInit = {
      method,
      headers
    };

    if (options.body !== undefined) {
      fetchOptions.body = options.body;
    }

    return fetchWithRetry(url, fetchOptions);
  }

  async function post(endpoint: string, body?: BodyInit | ReadStream, options: FetchOptions = {}) {
    const finalBody = body instanceof ReadStream ? await streamToBuffer(body) : body;
    return request("POST", endpoint, { ...options,
      body: finalBody });
  }

  async function get(endpoint: string, options: FetchOptions = {}) {
    return request("GET", endpoint, options);
  }

  async function patch(endpoint: string, body?: BodyInit, options: FetchOptions = {}) {
    return request("PATCH", endpoint, { ...options,
      body });
  }

  return {
    post,
    get,
    patch
  };
}

export type { HttpResponse };
