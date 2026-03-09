import { ReadStream } from "node:fs";
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
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
function stringifyParams(params) {
    const entries = Object.entries(params).map(([key, value]) => [key, String(value)]);
    return new URLSearchParams(entries).toString();
}
const REQUEST_TIMEOUT_MS = 120_000;
async function fetchResponse(url, options) {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const contentType = response.headers.get("content-type");
        const data = contentType && contentType.includes("application/json") ? await response.json() : await response.text();
        return {
            data,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
        };
    }
    finally {
        globalThis.clearTimeout(timeoutId);
    }
}
export function createHttpClient(baseURL, defaultHeaders = {}) {
    function request(method, endpoint, options = {}) {
        const base = `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
        const url = options.params ? `${base}?${stringifyParams(options.params)}` : base;
        const headers = {
            ...defaultHeaders,
            ...options.headers
        };
        const fetchOptions = {
            method,
            headers,
            ...options.body !== undefined && { body: options.body }
        };
        return fetchResponse(url, fetchOptions);
    }
    async function post(endpoint, body, options = {}) {
        const finalBody = body instanceof ReadStream ? await streamToBuffer(body) : body;
        return request("POST", endpoint, { ...options, body: finalBody });
    }
    function get(endpoint, options = {}) {
        return request("GET", endpoint, options);
    }
    function patch(endpoint, body, options = {}) {
        return request("PATCH", endpoint, { ...options, body });
    }
    return { post, get, patch };
}
