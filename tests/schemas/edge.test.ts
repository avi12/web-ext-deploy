import { EdgeOptionsPublishApiSchema } from "../../src/stores/edge/edge-input.js";
import path from "node:path";
import { describe, it, expect } from "vitest";

const FIXTURE_ZIP = path.resolve(__dirname, "../fixtures/test.zip");

const validInput = {
  productId: "product-123",
  clientId: "client-456",
  apiKey: "api-key-789",
  zip: FIXTURE_ZIP
};

describe("EdgeOptionsPublishApiSchema", () => {
  it("accepts valid input", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse(validInput)).not.toThrow();
  });

  it("rejects missing productId", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, productId: "" })).toThrow();
  });

  it("rejects missing clientId", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, clientId: "" })).toThrow();
  });

  it("rejects missing apiKey", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, apiKey: "" })).toThrow();
  });

  it("rejects missing zip", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, zip: "" })).toThrow();
  });

  it("devChangelog is optional", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse(validInput)).not.toThrow();
  });

  it("rejects non-existent zip", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, zip: "nonexistent.zip" })).toThrow(
      "Zip doesn't exist"
    );
  });
});
