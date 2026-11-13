import path from "node:path";

import { describe, expect, it } from "vitest";

import { headersToEnv, isObjectEmpty } from "@/utils/helpers.js";
import { getCorrectZip, getFullPath } from "@/utils/zip.js";

describe("getFullPath", () => {
  it("returns absolute path ending with the filename", () => {
    const result = getFullPath("foo.zip");
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.endsWith("foo.zip")).toBe(true);
  });
});

describe("isObjectEmpty", () => {
  it("returns true for empty object", () => {
    expect(isObjectEmpty({})).toBe(true);
  });

  it("returns false for non-empty object", () => {
    expect(isObjectEmpty({ key: 1 })).toBe(false);
  });
});

describe("getCorrectZip", () => {
  it("replaces {version} with version from package.json", () => {
    const result = getCorrectZip("ext-v{version}.zip");
    expect(result).toMatch(/ext-v\d+\.\d+\.\d+\.zip/);
  });

  it("returns unchanged name when no {version} token", () => {
    expect(getCorrectZip("plain.zip")).toBe("plain.zip");
  });
});

describe("headersToEnv", () => {
  it("converts object to key=value lines", () => {
    const result = headersToEnv({
      FOO: "bar",
      BAZ: 123
    });
    expect(result).toBe('FOO="bar"\nBAZ="123"');
  });
});
