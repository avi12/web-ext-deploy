import { describe, it, expect } from "vitest";
import path from "node:path";
import { EdgeOptionsPublishApiSchema } from "../../src/stores/edge/edge-input.js";

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
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, productId: "" })).toThrow("No product ID");
  });

  it("rejects missing clientId", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, clientId: "" })).toThrow("No client ID");
  });

  it("rejects missing apiKey", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, apiKey: "" })).toThrow("No API key");
  });

  it("rejects missing zip", () => {
    expect(() => EdgeOptionsPublishApiSchema.parse({ ...validInput, zip: "" })).toThrow("No zip");
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
