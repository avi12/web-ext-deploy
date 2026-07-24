import { deployToFirefox } from "../src/stores/firefox/firefox-deploy.js";
import { StoreStatus } from "../src/types.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

const { httpClient } = vi.hoisted(() => ({
  httpClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn()
  }
}));

vi.mock("../src/http/client.js", () => ({ createHttpClient: () => httpClient }));

vi.mock("../src/http/jwt.js", () => ({ generateJwt: () => "sanitized-token" }));

vi.mock("../src/utils/zip.js", () => ({ getExtJson: () => Promise.resolve({ name: "Example extension", version: "4.0.1" }) }));

const FIXTURE_ZIP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test.zip");

const uploadResponse = {
  data: {
    uuid: "sanitized-upload-uuid",
    channel: "listed",
    processed: true,
    submitted: false,
    url: "https://example.invalid/upload",
    valid: true,
    validation: { messages: [] },
    version: "4.0.1"
  },
  status: 200,
  statusText: "OK"
};

const versionResponse = {
  id: 123,
  approval_notes: null,
  channel: "listed",
  compatibility: { firefox: { min: "109.0", max: "*" } },
  edit_url: "https://example.invalid/edit",
  file: {
    id: 456,
    created: "2026-07-24T12:00:00Z",
    hash: "sha256:sanitized",
    is_mozilla_signed_extension: false,
    size: 1024,
    status: "unreviewed",
    url: "https://example.invalid/example.xpi",
    permissions: [],
    optional_permissions: [],
    host_permissions: []
  },
  is_disabled: false,
  is_strict_compatibility_enabled: false,
  license: {
    id: 13,
    is_custom: false,
    name: null,
    slug: null,
    text: null,
    url: null
  },
  release_notes: null,
  reviewed: null,
  source: null,
  version: "4.0.1"
};

describe("deployToFirefox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads missing source without recreating an existing version", async () => {
    httpClient.get.mockResolvedValue({ data: versionResponse, status: 200, statusText: "OK" });
    httpClient.patch.mockResolvedValue({
      data: { ...versionResponse, source: "https://example.invalid/source.zip" },
      status: 200,
      statusText: "OK"
    });

    await expect(deployToFirefox({
      extId: "example-extension",
      jwtIssuer: "sanitized-issuer",
      jwtSecret: "sanitized-secret",
      zip: FIXTURE_ZIP,
      zipSource: FIXTURE_ZIP,
      changelog: "",
      changelogLang: "en-US",
      devChangelog: ""
    })).resolves.toBe(true);

    expect(httpClient.post).not.toHaveBeenCalled();
    expect(httpClient.patch).toHaveBeenCalledOnce();
  });

  it("resumes source upload when AMO created the version before reporting an error", async () => {
    let versionLookupCount = 0;
    httpClient.get.mockImplementation((endpoint: string) => {
      if (endpoint.includes("upload/")) {
        return Promise.resolve(uploadResponse);
      }

      versionLookupCount++;

      if (versionLookupCount === 1) {
        return Promise.resolve({ data: { detail: "Not found." }, status: 404, statusText: "Not Found" });
      }

      return Promise.resolve({ data: versionResponse, status: 200, statusText: "OK" });
    });
    httpClient.post.mockImplementation((endpoint: string) => {
      if (endpoint === "upload/") {
        return Promise.resolve(uploadResponse);
      }

      return Promise.resolve({
        data: { version: ["Version 4.0.1 already exists."] },
        status: 400,
        statusText: "Bad Request"
      });
    });
    httpClient.patch.mockResolvedValue({
      data: { ...versionResponse, source: "https://example.invalid/source.zip" },
      status: 200,
      statusText: "OK"
    });
    const setStatus = vi.fn();

    await expect(deployToFirefox({
      extId: "example-extension",
      jwtIssuer: "sanitized-issuer",
      jwtSecret: "sanitized-secret",
      zip: FIXTURE_ZIP,
      zipSource: FIXTURE_ZIP,
      changelog: "",
      changelogLang: "en-US",
      devChangelog: ""
    }, { setStatus })).resolves.toBe(true);

    expect(httpClient.post).toHaveBeenCalledTimes(2);
    expect(httpClient.patch).toHaveBeenCalledWith(
      "addon/example-extension/versions/v4.0.1/",
      expect.any(Buffer),
      expect.any(Object)
    );
    expect(setStatus).toHaveBeenCalledWith(StoreStatus.Success);
  });
});
