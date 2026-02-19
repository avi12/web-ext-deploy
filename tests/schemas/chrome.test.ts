import {describe, it, expect} from "vitest";
import path from "node:path";
import {ChromeOptionsSchema} from "../../src/stores/chrome/chrome-input.js";

const FIXTURE_ZIP = path.resolve(__dirname, "../fixtures/test.zip");

const validInput = {
  "extId": "abc123",
  "publisherId": "publisher-456",
  "refreshToken": "refresh-token",
  "zip": FIXTURE_ZIP
};

describe("ChromeOptionsSchema", () => {
  it("accepts valid input", () => {
    expect(() => ChromeOptionsSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing extId", () => {
    expect(() => ChromeOptionsSchema.parse({...validInput,
      "extId": ""})).toThrow("No extension ID");
  });

  it("rejects missing publisherId", () => {
    expect(() => ChromeOptionsSchema.parse({...validInput,
      "publisherId": ""})).toThrow("No publisher ID");
  });

  it("rejects missing refreshToken", () => {
    expect(() => ChromeOptionsSchema.parse({...validInput,
      "refreshToken": ""})).toThrow("No refresh token");
  });

  it("rejects missing zip", () => {
    expect(() => ChromeOptionsSchema.parse({...validInput,
      "zip": ""})).toThrow("No zip");
  });

  it("rejects non-existent zip path", () => {
    expect(() => ChromeOptionsSchema.parse({...validInput,
      "zip": "nonexistent.zip"})).toThrow("Zip doesn't exist");
  });
});
