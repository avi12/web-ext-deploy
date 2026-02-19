import {describe, it, expect} from "vitest";
import path from "node:path";
import {OperaOptionsSchema} from "../../src/stores/opera/opera-input.js";

const FIXTURE_ZIP = path.resolve(__dirname, "../fixtures/test.zip");

const validInput = {
  "packageId": 12345,
  "sessionid": "abc123",
  "csrftoken": "xyz789",
  "zip": FIXTURE_ZIP
};

describe("OperaOptionsSchema", () => {
  it("accepts valid input", () => {
    expect(() => OperaOptionsSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing packageId", () => {
    expect(() => OperaOptionsSchema.parse({...validInput,
      "packageId": undefined})).toThrow();
  });

  it("coerces string packageId to number", () => {
    const result = OperaOptionsSchema.parse({...validInput,
      "packageId": "12345"});
    expect(result.packageId).toBe(12345);
  });

  it("rejects missing zip", () => {
    expect(() => OperaOptionsSchema.parse({...validInput,
      "zip": ""})).toThrow("No zip");
  });

  it("rejects missing sessionid", () => {
    const {"sessionid": _, ...input} = validInput;
    expect(() => OperaOptionsSchema.parse(input)).toThrow();
  });

  it("rejects empty sessionid", () => {
    expect(() => OperaOptionsSchema.parse({...validInput,
      "sessionid": ""})).toThrow("No sessionid");
  });

  it("rejects missing csrftoken", () => {
    const {"csrftoken": _, ...input} = validInput;
    expect(() => OperaOptionsSchema.parse(input)).toThrow();
  });

  it("rejects empty csrftoken", () => {
    expect(() => OperaOptionsSchema.parse({...validInput,
      "csrftoken": ""})).toThrow("No csrftoken");
  });

  it("changelog is optional", () => {
    expect(() => OperaOptionsSchema.parse(validInput)).not.toThrow();
  });

  it("rejects non-existent zip", () => {
    expect(() => OperaOptionsSchema.parse({...validInput,
      "zip": "nonexistent.zip"})).toThrow("Zip doesn't exist");
  });
});
