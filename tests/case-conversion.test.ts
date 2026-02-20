import { camelCase, kebabCase, capitalCase } from "../src/case-conversion.js";
import { describe, it, expect } from "vitest";

describe("camelCase", () => {
  it("converts kebab-case", () => {
    expect(camelCase("foo-bar")).toBe("fooBar");
  });

  it("converts snake_case", () => {
    expect(camelCase("foo_bar")).toBe("fooBar");
  });

  it("converts space-separated", () => {
    expect(camelCase("foo bar")).toBe("fooBar");
  });
});

describe("kebabCase", () => {
  it("converts camelCase", () => {
    expect(kebabCase("fooBar")).toBe("foo-bar");
  });

  it("converts snake_case", () => {
    expect(kebabCase("foo_bar")).toBe("foo-bar");
  });

  it("converts space-separated", () => {
    expect(kebabCase("foo bar")).toBe("foo-bar");
  });
});

describe("capitalCase", () => {
  it("capitalizes single word", () => {
    expect(capitalCase("chrome")).toBe("Chrome");
  });

  it("capitalizes multiple words", () => {
    expect(capitalCase("foo bar")).toBe("Foo Bar");
  });
});
