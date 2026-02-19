import {describe, it, expect} from "vitest";
import path from "node:path";
import {FirefoxOptionsSubmissionApiSchema} from "../../src/stores/firefox/firefox-input.js";

const FIXTURE_ZIP = path.resolve(__dirname, "../fixtures/test.zip");

const validInput = {
  "extId": "addon@example.com",
  "jwtIssuer": "issuer123",
  "jwtSecret": "secret456",
  "zip": FIXTURE_ZIP
};

describe("FirefoxOptionsSubmissionApiSchema", () => {
  it("accepts valid input", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing extId", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({...validInput,
      "extId": ""})).toThrow("No extension ID");
  });

  it("rejects missing jwtIssuer", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({...validInput,
      "jwtIssuer": ""})).toThrow("No JWT issuer");
  });

  it("rejects missing jwtSecret", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({...validInput,
      "jwtSecret": ""})).toThrow("No JWT secret");
  });

  it("rejects missing zip", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({...validInput,
      "zip": ""})).toThrow("No zip");
  });

  it("defaults changelogLang to en-US", () => {
    const result = FirefoxOptionsSubmissionApiSchema.parse(validInput);
    expect(result.changelogLang).toBe("en-US");
  });

  it("zipSource, changelog, devChangelog are optional", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse(validInput)).not.toThrow();
  });

  it("rejects non-existent zip", () => {
    expect(() => FirefoxOptionsSubmissionApiSchema.parse({...validInput,
      "zip": "nonexistent.zip"})).toThrow(
      "Zip doesn't exist"
    );
  });

  it("rejects non-existent zipSource", () => {
    expect(() =>
      FirefoxOptionsSubmissionApiSchema.parse({...validInput,
        "zipSource": "nonexistent-source.zip"})
    ).toThrow("Zip source doesn't exist");
  });
});
