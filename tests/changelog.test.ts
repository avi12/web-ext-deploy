import { describe, it, expect } from "vitest";

describe("changelog newline conversions", () => {
  it("Firefox: //n becomes newline", () => {
    expect("line1//nline2".replace(/\/\/n/g, "\n")).toBe("line1\nline2");
  });

  it("Edge: /\\n becomes newline", () => {
    expect("line1/\nline2".replace(/\/\n/g, "\n")).toBe("line1\nline2");
  });

  it("Opera: \\\\n becomes newline", () => {
    expect("line1\\\\nline2".replaceAll("\\\\n", "\n")).toBe("line1\nline2");
  });
});
