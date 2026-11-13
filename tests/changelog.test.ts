import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EdgeOptionsPublishApiSchema } from "@/stores/edge/edge-input.js";
import { FirefoxOptionsSubmissionApiSchema } from "@/stores/firefox/firefox-input.js";
import { OperaOptionsSchema } from "@/stores/opera/opera-input.js";

const FIXTURE_ZIP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test.zip");

describe("changelog newline conversions", () => {
  it("Firefox: \\n literal in changelog is converted to a newline", () => {
    const result = FirefoxOptionsSubmissionApiSchema.parse({
      extId: "addon@test",
      jwtIssuer: "issuer",
      jwtSecret: "secret",
      zip: FIXTURE_ZIP,
      changelog: "line1\\nline2"
    });
    expect(result.changelog).toBe("line1\nline2");
  });

  it("Edge: \\n literal in devChangelog is converted to a newline", () => {
    const result = EdgeOptionsPublishApiSchema.parse({
      productId: "prod-123",
      clientId: "client-456",
      apiKey: "key-789",
      zip: FIXTURE_ZIP,
      devChangelog: "line1\\nline2"
    });
    expect(result.devChangelog).toBe("line1\nline2");
  });

  it("Opera: \\n literal in changelog is converted to a newline", () => {
    const result = OperaOptionsSchema.parse({
      packageId: 123,
      sessionid: "sess",
      csrftoken: "csrf",
      zip: FIXTURE_ZIP,
      changelog: "line1\\nline2"
    });
    expect(result.changelog).toBe("line1\nline2");
  });
});
