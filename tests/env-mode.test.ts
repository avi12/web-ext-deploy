import { config } from "../src/dotenv.js";
import { ChromeOptionsSchema } from "../src/stores/chrome/chrome-input.js";
import { EdgeOptionsPublishApiSchema } from "../src/stores/edge/edge-input.js";
import { FirefoxOptionsSubmissionApiSchema } from "../src/stores/firefox/firefox-input.js";
import { OperaOptionsSchema } from "../src/stores/opera/opera-input.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";

const FIXTURE_ZIP = path.resolve(__dirname, "fixtures/test.zip");

describe("Env mode - .env parsing + validation", () => {
  const tmpFiles: string[] = [];

  function writeEnv (content: string): Record<string, string> {
    const tmpFile = path.join(os.tmpdir(), `web-ext-test-${Date.now()}-${Math.random()}.env`);
    fs.writeFileSync(tmpFile, content, "utf8");
    tmpFiles.push(tmpFile);
    const { parsed = {} } = config({ path: tmpFile });
    return parsed;
  }

  afterEach(() => {
    for (const file of tmpFiles) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    tmpFiles.length = 0;
  });

  describe("chrome", () => {
    it("valid chrome.env passes schema", () => {
      const parsed = writeEnv(`extId=abc123\npublisherId=pub-456\nrefreshToken=token-xyz\nzip=${FIXTURE_ZIP}`);
      expect(() => ChromeOptionsSchema.parse(parsed)).not.toThrow();
    });

    it("empty extId in .env fails", () => {
      const parsed = writeEnv(`extId=\npublisherId=pub-456\nrefreshToken=token-xyz\nzip=${FIXTURE_ZIP}`);
      expect(() => ChromeOptionsSchema.parse(parsed)).toThrow();
    });

    it("missing refreshToken in .env fails", () => {
      const parsed = writeEnv(`extId=abc123\npublisherId=pub-456\nzip=${FIXTURE_ZIP}`);
      expect(() => ChromeOptionsSchema.parse(parsed)).toThrow();
    });
  });

  describe("firefox", () => {
    it("valid firefox.env passes schema", () => {
      const parsed = writeEnv(
        `extId=addon-id\njwtIssuer=issuer-id\njwtSecret=secret-val\nzip=${FIXTURE_ZIP}`
      );
      expect(() => FirefoxOptionsSubmissionApiSchema.parse(parsed)).not.toThrow();
    });

    it("empty jwtIssuer in .env fails", () => {
      const parsed = writeEnv(`extId=addon-id\njwtIssuer=\njwtSecret=secret-val\nzip=${FIXTURE_ZIP}`);
      expect(() => FirefoxOptionsSubmissionApiSchema.parse(parsed)).toThrow();
    });

    it("missing jwtSecret in .env fails", () => {
      const parsed = writeEnv(`extId=addon-id\njwtIssuer=issuer-id\nzip=${FIXTURE_ZIP}`);
      expect(() => FirefoxOptionsSubmissionApiSchema.parse(parsed)).toThrow();
    });

    it("changelogLang defaults to en-US when absent from .env", () => {
      const parsed = writeEnv(`extId=addon-id\njwtIssuer=issuer-id\njwtSecret=secret-val\nzip=${FIXTURE_ZIP}`);
      const result = FirefoxOptionsSubmissionApiSchema.parse(parsed);
      expect(result.changelogLang).toBe("en-US");
    });
  });

  describe("edge", () => {
    it("valid edge.env passes schema", () => {
      const parsed = writeEnv(`productId=prod-123\nclientId=client-456\napiKey=key-789\nzip=${FIXTURE_ZIP}`);
      expect(() => EdgeOptionsPublishApiSchema.parse(parsed)).not.toThrow();
    });

    it("empty apiKey in .env fails", () => {
      const parsed = writeEnv(`productId=prod-123\nclientId=client-456\napiKey=\nzip=${FIXTURE_ZIP}`);
      expect(() => EdgeOptionsPublishApiSchema.parse(parsed)).toThrow();
    });

    it("missing clientId in .env fails", () => {
      const parsed = writeEnv(`productId=prod-123\napiKey=key-789\nzip=${FIXTURE_ZIP}`);
      expect(() => EdgeOptionsPublishApiSchema.parse(parsed)).toThrow();
    });
  });

  describe("opera", () => {
    it("valid opera.env passes schema", () => {
      const parsed = writeEnv(
        `packageId=100\nsessionid=sess-abc\ncsrftoken=csrf-xyz\nzip=${FIXTURE_ZIP}`
      );
      expect(() => OperaOptionsSchema.parse(parsed)).not.toThrow();
    });

    it("packageId as string in .env is coerced to number", () => {
      const parsed = writeEnv(
        `packageId=42\nsessionid=sess-abc\ncsrftoken=csrf-xyz\nzip=${FIXTURE_ZIP}`
      );
      const result = OperaOptionsSchema.parse(parsed);
      expect(result.packageId).toBe(42);
    });

    it("empty sessionid in .env fails", () => {
      const parsed = writeEnv(`packageId=100\nsessionid=\ncsrftoken=csrf-xyz\nzip=${FIXTURE_ZIP}`);
      expect(() => OperaOptionsSchema.parse(parsed)).toThrow();
    });

    it("missing csrftoken in .env fails", () => {
      const parsed = writeEnv(`packageId=100\nsessionid=sess-abc\nzip=${FIXTURE_ZIP}`);
      expect(() => OperaOptionsSchema.parse(parsed)).toThrow();
    });
  });
});
