import { parse, config } from "../src/utils/dotenv.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("parse", () => {
  it("returns empty object for empty string", () => {
    expect(parse("")).toEqual({});
  });

  it("skips comment lines", () => {
    expect(parse("# this is a comment\n# another")).toEqual({});
  });

  it("parses double-quoted values", () => {
    expect(parse("KEY=\"value\"")).toEqual({ KEY: "value" });
  });

  it("parses single-quoted values", () => {
    expect(parse("KEY='value'")).toEqual({ KEY: "value" });
  });

  it("parses unquoted values", () => {
    expect(parse("KEY=value")).toEqual({ KEY: "value" });
  });

  it("handles multiple equals signs", () => {
    expect(parse("KEY=val=ue")).toEqual({ KEY: "val=ue" });
  });

  it("trims whitespace around keys and values", () => {
    expect(parse("  KEY  =  value  ")).toEqual({ KEY: "value" });
  });

  it("skips lines without equals sign", () => {
    expect(parse("no-equals-here")).toEqual({});
  });

  it("parses multiple entries", () => {
    expect(parse("FOO=1\nBAR=2\nBAZ=3")).toEqual({
      FOO: "1", BAR: "2", BAZ: "3"
    });
  });
});

describe("config", () => {
  it("returns empty object for non-existent file", () => {
    expect(config({ path: "nonexistent-file.env" })).toEqual({});
  });

  it("returns parsed content from a valid file", () => {
    const tmpFile = path.join(os.tmpdir(), `dotenv-test-${Date.now()}.env`);
    fs.writeFileSync(tmpFile, "FOO=\"bar\"\nBAZ=qux");

    try {
      const result = config({ path: tmpFile });
      expect(result).toEqual({ parsed: { FOO: "bar", BAZ: "qux" } });
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});
