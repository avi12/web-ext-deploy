import { red, green, blue, yellow } from "../src/logging.js";
import { describe, it, expect } from "vitest";

describe("color helpers", () => {
  it("red wraps with red ANSI codes", () => {
    expect(red("hi")).toBe("\x1b[31mhi\x1b[0m");
  });

  it("green wraps with green ANSI codes", () => {
    expect(green("hi")).toBe("\x1b[32mhi\x1b[0m");
  });

  it("blue wraps with blue ANSI codes", () => {
    expect(blue("hi")).toBe("\x1b[34mhi\x1b[0m");
  });

  it("yellow wraps with yellow ANSI codes", () => {
    expect(yellow("hi")).toBe("\x1b[33mhi\x1b[0m");
  });
});
