import { deployStore } from "../src/deploy-single-store.js";
import path from "node:path";
import { describe, it, expect } from "vitest";

const FIXTURE_ZIP = path.resolve(__dirname, "fixtures/test.zip");

const validInputs: Record<string, Record<string, unknown>> = {
  chrome: {
    extId: "abc123",
    publisherId: "publisher-456",
    refreshToken: "refresh-token",
    zip: FIXTURE_ZIP
  },
  firefox: {
    extId: "addon@example.com",
    jwtIssuer: "issuer123",
    jwtSecret: "secret456",
    zip: FIXTURE_ZIP
  },
  edge: {
    productId: "product-123",
    clientId: "client-456",
    apiKey: "api-key-789",
    zip: FIXTURE_ZIP
  },
  opera: {
    packageId: 12345,
    sessionid: "abc123",
    csrftoken: "xyz789",
    zip: FIXTURE_ZIP
  }
};

function tryDeployStore(options: unknown, store: string): Promise<boolean> {
  try {
    return deployStore(options, store, { isDryRun: true });
  } catch (error) {
    return Promise.reject(error);
  }
}

describe("dry-run mode", () => {
  describe("single store validation", () => {
    for (const [store,
      options] of Object.entries(validInputs)) {
      it(`validates ${store} options without deploying`, async () => {
        const result = await deployStore(options, store, { isDryRun: true });
        expect(result).toBe(true);
      });
    }

    it("throws for unknown store", () => {
      expect(() => deployStore({}, "unknown-store", { isDryRun: true })).toThrow("Unknown store");
    });
  });

  describe("multi-store validation", () => {
    it("validates all four stores simultaneously", async () => {
      const results = await Promise.allSettled(
        Object.entries(validInputs).map(([store,
          options]) => tryDeployStore(options, store))
      );
      for (const result of results) {
        expect(result.status).toBe("fulfilled");
        if (result.status === "fulfilled") {
          expect(result.value).toBe(true);
        }
      }
    });

    it("validates chrome + firefox together", async () => {
      const [chrome,
        firefox] = await Promise.all([
        deployStore(validInputs.chrome, "chrome", { isDryRun: true }),
        deployStore(validInputs.firefox, "firefox", { isDryRun: true })
      ]);
      expect(chrome).toBe(true);
      expect(firefox).toBe(true);
    });

    it("validates edge + opera together", async () => {
      const [edge,
        opera] = await Promise.all([
        deployStore(validInputs.edge, "edge", { isDryRun: true }),
        deployStore(validInputs.opera, "opera", { isDryRun: true })
      ]);
      expect(edge).toBe(true);
      expect(opera).toBe(true);
    });
  });

  describe("partial config errors", () => {
    it("rejects chrome with only extId (missing refreshToken, zip)", () => {
      expect(() => deployStore({ extId: "abc123" }, "chrome", { isDryRun: true })).toThrow();
    });

    it("rejects chrome with extId + refreshToken but no zip", () => {
      expect(() =>
        deployStore({
          extId: "abc123",
          publisherId: "pub",
          refreshToken: "tok"
        }, "chrome", { isDryRun: true })
      ).toThrow();
    });

    it("rejects firefox with only extId (missing jwtIssuer, jwtSecret, zip)", () => {
      expect(() => deployStore({ extId: "addon@test" }, "firefox", { isDryRun: true })).toThrow();
    });

    it("rejects firefox with extId + jwtIssuer but no jwtSecret", () => {
      expect(() =>
        deployStore({
          extId: "addon@test",
          jwtIssuer: "iss"
        }, "firefox", { isDryRun: true })
      ).toThrow();
    });

    it("rejects edge with only productId (missing clientId, apiKey, zip)", () => {
      expect(() => deployStore({ productId: "prod" }, "edge", { isDryRun: true })).toThrow();
    });

    it("rejects edge with productId + clientId but no apiKey", () => {
      expect(() =>
        deployStore({
          productId: "prod",
          clientId: "cli"
        }, "edge", { isDryRun: true })
      ).toThrow();
    });

    it("rejects opera with only packageId (missing sessionid, csrftoken, zip)", () => {
      expect(() => deployStore({ packageId: 123 }, "opera", { isDryRun: true })).toThrow();
    });

    it("rejects opera with packageId + sessionid but no csrftoken", () => {
      expect(() =>
        deployStore({
          packageId: 123,
          sessionid: "sess"
        }, "opera", { isDryRun: true })
      ).toThrow();
    });
  });

  describe("missing required fields with empty strings", () => {
    it("rejects chrome with empty extId", () => {
      expect(() => deployStore({
        ...validInputs.chrome,
        extId: ""
      }, "chrome", { isDryRun: true })).toThrow();
    });

    it("rejects chrome with empty refreshToken", () => {
      expect(() =>
        deployStore({
          ...validInputs.chrome,
          refreshToken: ""
        }, "chrome", { isDryRun: true })
      ).toThrow();
    });

    it("rejects firefox with empty jwtIssuer", () => {
      expect(() =>
        deployStore({
          ...validInputs.firefox,
          jwtIssuer: ""
        }, "firefox", { isDryRun: true })
      ).toThrow();
    });

    it("rejects firefox with empty jwtSecret", () => {
      expect(() =>
        deployStore({
          ...validInputs.firefox,
          jwtSecret: ""
        }, "firefox", { isDryRun: true })
      ).toThrow();
    });

    it("rejects edge with empty apiKey", () => {
      expect(() => deployStore({
        ...validInputs.edge,
        apiKey: ""
      }, "edge", { isDryRun: true })).toThrow();
    });

    it("rejects opera with empty sessionid", () => {
      expect(() =>
        deployStore({
          ...validInputs.opera,
          sessionid: ""
        }, "opera", { isDryRun: true })
      ).toThrow();
    });

    it("rejects non-existent zip path", () => {
      expect(() =>
        deployStore({
          ...validInputs.chrome,
          zip: "nonexistent.zip"
        }, "chrome", { isDryRun: true })
      ).toThrow(/Zip doesn't exist/);
    });
  });

  describe("mixed valid and invalid stores", () => {
    it("chrome succeeds while firefox fails (missing jwtSecret)", async () => {
      const results = await Promise.allSettled([
        tryDeployStore(validInputs.chrome, "chrome"),
        tryDeployStore({
          extId: "addon@test",
          jwtIssuer: "iss"
        }, "firefox")
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
    });

    it("edge succeeds while opera fails (missing csrftoken)", async () => {
      const results = await Promise.allSettled([
        tryDeployStore(validInputs.edge, "edge"),
        tryDeployStore({
          packageId: 123,
          sessionid: "sess"
        }, "opera")
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
    });

    it("three stores succeed while one fails", async () => {
      const results = await Promise.allSettled([
        tryDeployStore(validInputs.chrome, "chrome"),
        tryDeployStore(validInputs.firefox, "firefox"),
        tryDeployStore({ productId: "prod" }, "edge"),
        tryDeployStore(validInputs.opera, "opera")
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("fulfilled");
      expect(results[2].status).toBe("rejected");
      expect(results[3].status).toBe("fulfilled");
    });

    it("all stores fail with empty configs", async () => {
      const results = await Promise.allSettled([
        tryDeployStore({}, "chrome"),
        tryDeployStore({}, "firefox"),
        tryDeployStore({}, "edge"),
        tryDeployStore({}, "opera")
      ]);
      for (const result of results) {
        expect(result.status).toBe("rejected");
      }
    });
  });
});
