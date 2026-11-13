import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ChromeOptionsSchema } from "@/stores/chrome/chrome-input.js";

const FIXTURE_ZIP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/test.zip");

const validInput = {
  extId: "abc123",
  publisherId: "publisher-456",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  zip: FIXTURE_ZIP
};

describe("ChromeOptionsSchema", () => {
  it("accepts valid input", () => {
    expect(() => ChromeOptionsSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing extId", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        extId: ""
      })
    ).toThrow();
  });

  it("rejects missing publisherId", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        publisherId: ""
      })
    ).toThrow();
  });

  it("rejects missing refreshToken", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        refreshToken: ""
      })
    ).toThrow();
  });

  it("rejects missing zip", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        zip: ""
      })
    ).toThrow();
  });

  it("rejects non-existent zip path", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        zip: "nonexistent.zip"
      })
    ).toThrow("Zip doesn't exist");
  });

  it("skipReview defaults to false", () => {
    const result = ChromeOptionsSchema.parse(validInput);
    expect(result.skipReview).toBe(false);
  });

  it("accepts skipReview as boolean", () => {
    const result = ChromeOptionsSchema.parse({
      ...validInput,
      skipReview: true
    });
    expect(result.skipReview).toBe(true);
  });

  it("deployPercentage is optional", () => {
    const result = ChromeOptionsSchema.parse(validInput);
    expect(result.deployPercentage).toBeUndefined();
  });

  it("accepts valid deployPercentage", () => {
    const result = ChromeOptionsSchema.parse({
      ...validInput,
      deployPercentage: 50
    });
    expect(result.deployPercentage).toBe(50);
  });

  it("rejects deployPercentage below 1", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        deployPercentage: 0
      })
    ).toThrow();
  });

  it("rejects deployPercentage above 100", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        deployPercentage: 101
      })
    ).toThrow();
  });

  it("rejects non-integer deployPercentage", () => {
    expect(() =>
      ChromeOptionsSchema.parse({
        ...validInput,
        deployPercentage: 50.5
      })
    ).toThrow();
  });
});
