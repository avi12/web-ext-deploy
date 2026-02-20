import { ChromeOptionsSchema } from "../src/stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApiSchema } from "../src/stores/edge/edge-input.js";
import { FirefoxOptionsSubmissionApiSchema } from "../src/stores/firefox/firefox-input.js";
import { OperaOptionsSchema } from "../src/stores/opera/opera-input.js";
import { mapStoreArgs } from "../src/utils.js";
import path from "node:path";
import { describe, it, expect } from "vitest";

const FIXTURE_ZIP = path.resolve(__dirname, "fixtures/test.zip");

describe("CLI mode - arg mapping + validation", () => {
  describe("chrome", () => {
    it("maps prefixed kebab-case args to camelCase keys", () => {
      const rawArgs = {
        "chrome-ext-id": "abc123",
        "chrome-publisher-id": "pub-456",
        "chrome-refresh-token": "token-xyz"
      };
      expect(mapStoreArgs(rawArgs, "chrome")).toEqual({
        extId: "abc123",
        publisherId: "pub-456",
        refreshToken: "token-xyz"
      });
    });

    it("valid mapped args pass schema", () => {
      const rawArgs = {
        "chrome-ext-id": "abc123",
        "chrome-publisher-id": "pub-456",
        "chrome-refresh-token": "token-xyz",
        "chrome-zip": FIXTURE_ZIP
      };
      expect(() => ChromeOptionsSchema.parse(mapStoreArgs(rawArgs, "chrome"))).not.toThrow();
    });

    it("empty ext-id fails with 'No extension ID'", () => {
      const rawArgs = {
        "chrome-ext-id": "",
        "chrome-publisher-id": "pub-456",
        "chrome-refresh-token": "token-xyz",
        "chrome-zip": FIXTURE_ZIP
      };
      expect(() => ChromeOptionsSchema.parse(mapStoreArgs(rawArgs, "chrome"))).toThrow("No extension ID");
    });

    it("missing refresh-token fails", () => {
      const rawArgs = {
        "chrome-ext-id": "abc123",
        "chrome-publisher-id": "pub-456",
        "chrome-zip": FIXTURE_ZIP
      };
      expect(() => ChromeOptionsSchema.parse(mapStoreArgs(rawArgs, "chrome"))).toThrow();
    });
  });

  describe("firefox", () => {
    it("maps prefixed args to camelCase keys", () => {
      const rawArgs = {
        "firefox-jwt-issuer": "issuer-id",
        "firefox-jwt-secret": "secret-val",
        "firefox-ext-id": "addon-id"
      };
      expect(mapStoreArgs(rawArgs, "firefox")).toEqual({
        jwtIssuer: "issuer-id",
        jwtSecret: "secret-val",
        extId: "addon-id"
      });
    });

    it("valid mapped args pass schema", () => {
      const rawArgs = {
        "firefox-ext-id": "addon-id",
        "firefox-jwt-issuer": "issuer-id",
        "firefox-jwt-secret": "secret-val",
        "firefox-zip": FIXTURE_ZIP
      };
      expect(() => FirefoxOptionsSubmissionApiSchema.parse(mapStoreArgs(rawArgs, "firefox"))).not.toThrow();
    });

    it("empty jwt-issuer fails with 'No JWT issuer'", () => {
      const rawArgs = {
        "firefox-ext-id": "addon-id",
        "firefox-jwt-issuer": "",
        "firefox-jwt-secret": "secret-val",
        "firefox-zip": FIXTURE_ZIP
      };
      expect(() => FirefoxOptionsSubmissionApiSchema.parse(mapStoreArgs(rawArgs, "firefox"))).toThrow("No JWT issuer");
    });

    it("missing jwt-secret fails", () => {
      const rawArgs = {
        "firefox-ext-id": "addon-id",
        "firefox-jwt-issuer": "issuer-id",
        "firefox-zip": FIXTURE_ZIP
      };
      expect(() => FirefoxOptionsSubmissionApiSchema.parse(mapStoreArgs(rawArgs, "firefox"))).toThrow();
    });
  });

  describe("edge", () => {
    it("maps prefixed args to camelCase keys", () => {
      const rawArgs = {
        "edge-product-id": "prod-123",
        "edge-client-id": "client-456",
        "edge-api-key": "key-789"
      };
      expect(mapStoreArgs(rawArgs, "edge")).toEqual({
        productId: "prod-123",
        clientId: "client-456",
        apiKey: "key-789"
      });
    });

    it("valid mapped args pass schema", () => {
      const rawArgs = {
        "edge-product-id": "prod-123",
        "edge-client-id": "client-456",
        "edge-api-key": "key-789",
        "edge-zip": FIXTURE_ZIP
      };
      expect(() => EdgeOptionsPublishApiSchema.parse(mapStoreArgs(rawArgs, "edge"))).not.toThrow();
    });

    it("empty api-key fails with 'No API key'", () => {
      const rawArgs = {
        "edge-product-id": "prod-123",
        "edge-client-id": "client-456",
        "edge-api-key": "",
        "edge-zip": FIXTURE_ZIP
      };
      expect(() => EdgeOptionsPublishApiSchema.parse(mapStoreArgs(rawArgs, "edge"))).toThrow("No API key");
    });

    it("missing product-id fails", () => {
      const rawArgs = {
        "edge-client-id": "client-456",
        "edge-api-key": "key-789",
        "edge-zip": FIXTURE_ZIP
      };
      expect(() => EdgeOptionsPublishApiSchema.parse(mapStoreArgs(rawArgs, "edge"))).toThrow();
    });
  });

  describe("opera", () => {
    it("maps prefixed args to camelCase keys", () => {
      const rawArgs = {
        "opera-package-id": "100",
        "opera-sessionid": "sess-abc",
        "opera-csrftoken": "csrf-xyz"
      };
      expect(mapStoreArgs(rawArgs, "opera")).toEqual({
        packageId: "100",
        sessionid: "sess-abc",
        csrftoken: "csrf-xyz"
      });
    });

    it("valid mapped args pass schema", () => {
      const rawArgs = {
        "opera-package-id": "100",
        "opera-sessionid": "sess-abc",
        "opera-csrftoken": "csrf-xyz",
        "opera-zip": FIXTURE_ZIP
      };
      expect(() => OperaOptionsSchema.parse(mapStoreArgs(rawArgs, "opera"))).not.toThrow();
    });

    it("string package-id coerced to number after mapping", () => {
      const rawArgs = {
        "opera-package-id": "42",
        "opera-sessionid": "sess-abc",
        "opera-csrftoken": "csrf-xyz",
        "opera-zip": FIXTURE_ZIP
      };
      const result = OperaOptionsSchema.parse(mapStoreArgs(rawArgs, "opera"));
      expect(result.packageId).toBe(42);
    });

    it("empty sessionid fails with 'No sessionid'", () => {
      const rawArgs = {
        "opera-package-id": "100",
        "opera-sessionid": "",
        "opera-csrftoken": "csrf-xyz",
        "opera-zip": FIXTURE_ZIP
      };
      expect(() => OperaOptionsSchema.parse(mapStoreArgs(rawArgs, "opera"))).toThrow("No sessionid");
    });
  });
});
