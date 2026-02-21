import { ReadStream } from "node:fs";

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
  params?: Record<string, string | number>;
}

function streamToBuffer (stream: ReadStream) {
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

function stringifyParams (params: Record<string, string | number>) {
  const entries = Object.entries(params).map(([key, value]) => [key, String(value)]);
  return new URLSearchParams(entries).toString();
}

async function fetchResponse (url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type");
  const data: unknown =
    contentType && contentType.includes("application/json") ? await response.json() : await response.text();

  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries())
  };
}

export function createHttpClient (baseURL: string, defaultHeaders: Record<string, string> = {}) {
  function request (method: "GET" | "POST" | "PATCH", endpoint: string, options: FetchOptions = {}) {
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

  async function post (endpoint: string, body?: BodyInit | ReadStream, options: FetchOptions = {}) {
    const finalBody = body instanceof ReadStream ? await streamToBuffer(body) : body;
    return request("POST", endpoint, { ...options, body: finalBody });
  }

  function get (endpoint: string, options: FetchOptions = {}) {
    return request("GET", endpoint, options);
  }

  function patch (endpoint: string, body?: BodyInit, options: FetchOptions = {}) {
    return request("PATCH", endpoint, { ...options, body });
  }

  return {
    post, get, patch
  };
}
