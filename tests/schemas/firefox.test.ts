import { FirefoxOptionsSubmissionApiSchema } from "../../src/stores/firefox/firefox-input.js";
import { FirefoxCreateNewVersionSchema } from "../../src/stores/firefox/firefox-types.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const FIXTURE_ZIP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/test.zip");

const validInput = {
  extId: "addon@example.com",
  jwtIssuer: "issuer123",
  jwtSecret: "secret456",
  zip: FIXTURE_ZIP
};

const validVersionResponse = {
  id: 123,
  approval_notes: null,
  channel: "listed",
  compatibility: { firefox: { min: "109.0", max: "*" } },
  edit_url: "https://addons.mozilla.org/developers/addon/example/versions/123",
  file: {
    id: 456,
    created: "2026-07-24T12:00:00Z",
    hash: "sha256:example",
    is_mozilla_signed_extension: false,
    size: 1024,
    status: "unreviewed",
    url: "https://example.invalid/example.xpi",
    permissions: ["storage"],
    optional_permissions: [],
    host_permissions: []
  },
  is_disabled: false,
  is_strict_compatibility_enabled: false,
  license: {
    id: 13,
    is_custom: false,
    name: { "en-US": "MIT License" },
    slug: "MIT",
    text: { "en-US": "Permission is hereby granted..." },
    url: "https://opensource.org/license/mit"
  },
  release_notes: { "en-US": "Release notes" },
  reviewed: null,
  source: null,
  version: "4.0.1"
};

describe("FirefoxOptionsSubmissionApiSchema", () => {
  it("accepts valid input", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing extId", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({ ...validInput, extId: "" })).toThrow();
  });

  it("rejects missing jwtIssuer", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({ ...validInput, jwtIssuer: "" })).toThrow();
  });

  it("rejects missing jwtSecret", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({ ...validInput, jwtSecret: "" })).toThrow();
  });

  it("rejects missing zip", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({ ...validInput, zip: "" })).toThrow();
  });

  it("defaults changelogLang to en-US", () => {
    const result = FirefoxOptionsSubmissionApiSchema.parse(validInput);
    expect(result.changelogLang).toBe("en-US");
  });

  it("zipSource, changelog, devChangelog are optional", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse(validInput)).not.toThrow();
  });

  it("rejects non-existent zip", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({ ...validInput, zip: "nonexistent.zip" })).toThrow(
      "Zip doesn't exist"
    );
  });

  it("rejects non-existent zipSource", () => {
    expect(() =>
      FirefoxOptionsSubmissionApiSchema.parse({ ...validInput, zipSource: "nonexistent-source.zip" })
    ).toThrow("Source zip doesn't exist");
  });
});

describe("FirefoxCreateNewVersionSchema", () => {
  it("accepts nullable license values returned by AMO", () => {
    const response = {
      ...validVersionResponse,
      license: {
        ...validVersionResponse.license,
        name: null,
        slug: null,
        text: null,
        url: null
      }
    };

    expect(FirefoxCreateNewVersionSchema.parse(response).license).toEqual(response.license);
  });

  it("accepts a null license", () => {
    expect(FirefoxCreateNewVersionSchema.parse({ ...validVersionResponse, license: null }).license).toBeNull();
  });

  it("accepts populated localized license fields", () => {
    expect(FirefoxCreateNewVersionSchema.parse(validVersionResponse).license).toEqual(validVersionResponse.license);
  });

  it("accepts an omitted license text outside version detail responses", () => {
    const license = {
      id: validVersionResponse.license.id,
      is_custom: validVersionResponse.license.is_custom,
      name: validVersionResponse.license.name,
      slug: validVersionResponse.license.slug,
      url: validVersionResponse.license.url
    };
    expect(FirefoxCreateNewVersionSchema.parse({ ...validVersionResponse, license }).license).toEqual(license);
  });

  it("rejects an invalid deployment version", () => {
    expect(() => FirefoxCreateNewVersionSchema.parse({ ...validVersionResponse, version: 401 })).toThrow();
  });

  it("rejects an invalid source URL", () => {
    expect(() => FirefoxCreateNewVersionSchema.parse({ ...validVersionResponse, source: false })).toThrow();
  });
});
