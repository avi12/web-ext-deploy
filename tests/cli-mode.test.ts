import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ChromeOptionsSchema } from "@/stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApiSchema } from "@/stores/edge/edge-input.js";
import { FirefoxOptionsSubmissionApiSchema } from "@/stores/firefox/firefox-input.js";
import { OperaOptionsSchema } from "@/stores/opera/opera-input.js";
import { mapStoreArgs } from "@/utils/helpers.js";

const FIXTURE_ZIP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test.zip");

describe("CLI mode - arg mapping + validation", () => {
  describe("chrome", () => {
    it("maps prefixed kebab-case args to camelCase keys", () => {
      const rawArgs = {
        "chrome-ext-id": "abc123",
        "chrome-publisher-id": "pub-456",
        "chrome-refresh-token": "token-xyz"
      };
      expect(
        mapStoreArgs({
          rawArgs,
          store: "chrome"
        })
      ).toEqual({
        extId: "abc123",
        publisherId: "pub-456",
        refreshToken: "token-xyz"
      });
    });

    it("valid mapped args pass schema", () => {
      const rawArgs = {
        "chrome-ext-id": "abc123",
        "chrome-publisher-id": "pub-456",
        "chrome-client-id": "client-id",
        "chrome-client-secret": "client-secret",
        "chrome-refresh-token": "token-xyz",
        "chrome-zip": FIXTURE_ZIP
      };
      expect(() =>
        ChromeOptionsSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "chrome"
          })
        )
      ).not.toThrow();
    });

    it("empty ext-id fails", () => {
      const rawArgs = {
        "chrome-ext-id": "",
        "chrome-publisher-id": "pub-456",
        "chrome-refresh-token": "token-xyz",
        "chrome-zip": FIXTURE_ZIP
      };
      expect(() =>
        ChromeOptionsSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "chrome"
          })
        )
      ).toThrow();
    });

    it("missing refresh-token fails", () => {
      const rawArgs = {
        "chrome-ext-id": "abc123",
        "chrome-publisher-id": "pub-456",
        "chrome-zip": FIXTURE_ZIP
      };
      expect(() =>
        ChromeOptionsSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "chrome"
          })
        )
      ).toThrow();
    });
  });

  describe("firefox", () => {
    it("maps prefixed args to camelCase keys", () => {
      const rawArgs = {
        "firefox-jwt-issuer": "issuer-id",
        "firefox-jwt-secret": "secret-val",
        "firefox-ext-id": "addon-id"
      };
      expect(
        mapStoreArgs({
          rawArgs,
          store: "firefox"
        })
      ).toEqual({
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
      expect(() =>
        FirefoxOptionsSubmissionApiSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "firefox"
          })
        )
      ).not.toThrow();
    });

    it("empty jwt-issuer fails", () => {
      const rawArgs = {
        "firefox-ext-id": "addon-id",
        "firefox-jwt-issuer": "",
        "firefox-jwt-secret": "secret-val",
        "firefox-zip": FIXTURE_ZIP
      };
      expect(() =>
        FirefoxOptionsSubmissionApiSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "firefox"
          })
        )
      ).toThrow();
    });

    it("missing jwt-secret fails", () => {
      const rawArgs = {
        "firefox-ext-id": "addon-id",
        "firefox-jwt-issuer": "issuer-id",
        "firefox-zip": FIXTURE_ZIP
      };
      expect(() =>
        FirefoxOptionsSubmissionApiSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "firefox"
          })
        )
      ).toThrow();
    });
  });

  describe("edge", () => {
    it("maps prefixed args to camelCase keys", () => {
      const rawArgs = {
        "edge-product-id": "prod-123",
        "edge-client-id": "client-456",
        "edge-api-key": "key-789"
      };
      expect(
        mapStoreArgs({
          rawArgs,
          store: "edge"
        })
      ).toEqual({
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
      expect(() =>
        EdgeOptionsPublishApiSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "edge"
          })
        )
      ).not.toThrow();
    });

    it("empty api-key fails", () => {
      const rawArgs = {
        "edge-product-id": "prod-123",
        "edge-client-id": "client-456",
        "edge-api-key": "",
        "edge-zip": FIXTURE_ZIP
      };
      expect(() =>
        EdgeOptionsPublishApiSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "edge"
          })
        )
      ).toThrow();
    });

    it("missing product-id fails", () => {
      const rawArgs = {
        "edge-client-id": "client-456",
        "edge-api-key": "key-789",
        "edge-zip": FIXTURE_ZIP
      };
      expect(() =>
        EdgeOptionsPublishApiSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "edge"
          })
        )
      ).toThrow();
    });
  });

  describe("opera", () => {
    it("maps prefixed args to camelCase keys", () => {
      const rawArgs = {
        "opera-package-id": "100",
        "opera-sessionid": "sess-abc",
        "opera-csrftoken": "csrf-xyz"
      };
      expect(
        mapStoreArgs({
          rawArgs,
          store: "opera"
        })
      ).toEqual({
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
      expect(() =>
        OperaOptionsSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "opera"
          })
        )
      ).not.toThrow();
    });

    it("string package-id coerced to number after mapping", () => {
      const rawArgs = {
        "opera-package-id": "42",
        "opera-sessionid": "sess-abc",
        "opera-csrftoken": "csrf-xyz",
        "opera-zip": FIXTURE_ZIP
      };
      const result = OperaOptionsSchema.parse(
        mapStoreArgs({
          rawArgs,
          store: "opera"
        })
      );
      expect(result.packageId).toBe(42);
    });

    it("empty sessionid fails", () => {
      const rawArgs = {
        "opera-package-id": "100",
        "opera-sessionid": "",
        "opera-csrftoken": "csrf-xyz",
        "opera-zip": FIXTURE_ZIP
      };
      expect(() =>
        OperaOptionsSchema.parse(
          mapStoreArgs({
            rawArgs,
            store: "opera"
          })
        )
      ).toThrow();
    });
  });
});
