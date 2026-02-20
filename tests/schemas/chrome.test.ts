import { ChromeOptionsSchema } from "../../src/stores/chrome/chrome-input.js";
import path from "node:path";
import { describe, it, expect } from "vitest";

const FIXTURE_ZIP = path.resolve(__dirname, "../fixtures/test.zip");

const validInput = {
  extId: "abc123",
  publisherId: "publisher-456",
  refreshToken: "refresh-token",
  zip: FIXTURE_ZIP
};

describe("ChromeOptionsSchema", () => {
  it("accepts valid input", () => {
    expect(() => ChromeOptionsSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing extId", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, extId: "" })).toThrow("No extension ID");
  });

  it("rejects missing publisherId", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, publisherId: "" })).toThrow("No publisher ID");
  });

  it("rejects missing refreshToken", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, refreshToken: "" })).toThrow("No refresh token");
  });

  it("rejects missing zip", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, zip: "" })).toThrow("No zip");
  });

  it("rejects non-existent zip path", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, zip: "nonexistent.zip" })).toThrow("Zip doesn't exist");
  });

  it("skipReview is optional", () => {
    const result = ChromeOptionsSchema.parse(validInput);
    expect(result.skipReview).toBeUndefined();
  });

  it("accepts skipReview as boolean", () => {
    const result = ChromeOptionsSchema.parse({ ...validInput, skipReview: true });
    expect(result.skipReview).toBe(true);
  });

  it("deployPercentage is optional", () => {
    const result = ChromeOptionsSchema.parse(validInput);
    expect(result.deployPercentage).toBeUndefined();
  });

  it("accepts valid deployPercentage", () => {
    const result = ChromeOptionsSchema.parse({ ...validInput, deployPercentage: 50 });
    expect(result.deployPercentage).toBe(50);
  });

  it("rejects deployPercentage below 1", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, deployPercentage: 0 })).toThrow();
  });

  it("rejects deployPercentage above 100", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, deployPercentage: 101 })).toThrow();
  });

  it("rejects non-integer deployPercentage", () => {
    expect(() => ChromeOptionsSchema.parse({ ...validInput, deployPercentage: 50.5 })).toThrow();
  });
});
