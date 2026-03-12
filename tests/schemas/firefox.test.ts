import { FirefoxOptionsSubmissionApiSchema } from "../../src/stores/firefox/firefox-input.js";
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
