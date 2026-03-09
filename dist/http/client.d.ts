import { ReadStream } from "node:fs";
interface FetchOptions extends RequestInit {
    headers?: Record<string, string>;
    params?: Record<string, string | number>;
}
export declare function createHttpClient(baseURL: string, defaultHeaders?: Record<string, string>): {
    post: (endpoint: string, body?: BodyInit | ReadStream, options?: FetchOptions) => Promise<{
        data: unknown;
        status: number;
        statusText: string;
        headers: {
            [k: string]: string;
        };
    }>;
    get: (endpoint: string, options?: FetchOptions) => Promise<{
        data: unknown;
        status: number;
        statusText: string;
        headers: {
            [k: string]: string;
        };
    }>;
    patch: (endpoint: string, body?: BodyInit, options?: FetchOptions) => Promise<{
        data: unknown;
        status: number;
        statusText: string;
        headers: {
            [k: string]: string;
        };
    }>;
};
export {};
//# sourceMappingURL=client.d.ts.map