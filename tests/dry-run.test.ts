import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { deployStore } from "@/deploy-single-store.js";

const FIXTURE_ZIP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/test.zip");

const validInputs: Record<string, Record<string, unknown>> = {
  chrome: {
    extId: "abc123",
    publisherId: "publisher-456",
    clientId: "client-id",
    clientSecret: "client-secret",
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

function tryDeployStore({ options, store }: { options: unknown; store: string }) {
  try {
    return deployStore({
      options,
      storeName: store,
      context: {
        isDryRun: true
      }
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

describe("dry-run mode", () => {
  describe("single store validation", () => {
    for (const [store, options] of Object.entries(validInputs)) {
      it(`validates ${store} options without deploying`, async () => {
        const result = await deployStore({
          options,
          storeName: store,
          context: {
            isDryRun: true
          }
        });
        expect(result).toBe(true);
      });
    }

    it("throws for unknown store", () => {
      expect(() =>
        deployStore({
          options: {},
          storeName: "unknown-store",
          context: {
            isDryRun: true
          }
        })
      ).toThrow("Unknown store");
    });
  });

  describe("multi-store validation", () => {
    it("validates all four stores simultaneously", async () => {
      const results = await Promise.allSettled(
        Object.entries(validInputs).map(([store, options]) =>
          tryDeployStore({
            options,
            store
          })
        )
      );
      for (const result of results) {
        expect(result.status).toBe("fulfilled");

        if (result.status === "fulfilled") {
          expect(result.value).toBe(true);
        }
      }
    });

    it("validates chrome + firefox together", async () => {
      const [chrome, firefox] = await Promise.all([
        deployStore({
          options: validInputs.chrome,
          storeName: "chrome",
          context: {
            isDryRun: true
          }
        }),
        deployStore({
          options: validInputs.firefox,
          storeName: "firefox",
          context: {
            isDryRun: true
          }
        })
      ]);
      expect(chrome).toBe(true);
      expect(firefox).toBe(true);
    });

    it("validates edge + opera together", async () => {
      const [edge, opera] = await Promise.all([
        deployStore({
          options: validInputs.edge,
          storeName: "edge",
          context: {
            isDryRun: true
          }
        }),
        deployStore({
          options: validInputs.opera,
          storeName: "opera",
          context: {
            isDryRun: true
          }
        })
      ]);
      expect(edge).toBe(true);
      expect(opera).toBe(true);
    });
  });

  describe("partial config errors", () => {
    it("rejects chrome with only extId (missing refreshToken, zip)", () => {
      expect(() =>
        deployStore({
          options: {
            extId: "abc123"
          },
          storeName: "chrome",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects chrome with extId + refreshToken but no zip", () => {
      expect(() =>
        deployStore({
          options: {
            extId: "abc123",
            publisherId: "pub",
            refreshToken: "tok"
          },
          storeName: "chrome",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects firefox with only extId (missing jwtIssuer, jwtSecret, zip)", () => {
      expect(() =>
        deployStore({
          options: {
            extId: "addon@test"
          },
          storeName: "firefox",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects firefox with extId + jwtIssuer but no jwtSecret", () => {
      expect(() =>
        deployStore({
          options: {
            extId: "addon@test",
            jwtIssuer: "iss"
          },
          storeName: "firefox",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects edge with only productId (missing clientId, apiKey, zip)", () => {
      expect(() =>
        deployStore({
          options: {
            productId: "prod"
          },
          storeName: "edge",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects edge with productId + clientId but no apiKey", () => {
      expect(() =>
        deployStore({
          options: {
            productId: "prod",
            clientId: "cli"
          },
          storeName: "edge",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects opera with only packageId (missing sessionid, csrftoken, zip)", () => {
      expect(() =>
        deployStore({
          options: {
            packageId: 123
          },
          storeName: "opera",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects opera with packageId + sessionid but no csrftoken", () => {
      expect(() =>
        deployStore({
          options: {
            packageId: 123,
            sessionid: "sess"
          },
          storeName: "opera",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });
  });

  describe("missing required fields with empty strings", () => {
    it("rejects chrome with empty extId", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.chrome,
            extId: ""
          },
          storeName: "chrome",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects chrome with empty refreshToken", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.chrome,
            refreshToken: ""
          },
          storeName: "chrome",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects firefox with empty jwtIssuer", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.firefox,
            jwtIssuer: ""
          },
          storeName: "firefox",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects firefox with empty jwtSecret", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.firefox,
            jwtSecret: ""
          },
          storeName: "firefox",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects edge with empty apiKey", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.edge,
            apiKey: ""
          },
          storeName: "edge",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects opera with empty sessionid", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.opera,
            sessionid: ""
          },
          storeName: "opera",
          context: {
            isDryRun: true
          }
        })
      ).toThrow();
    });

    it("rejects non-existent zip path", () => {
      expect(() =>
        deployStore({
          options: {
            ...validInputs.chrome,
            zip: "nonexistent.zip"
          },
          storeName: "chrome",
          context: {
            isDryRun: true
          }
        })
      ).toThrow(/Zip doesn't exist/);
    });
  });

  describe("mixed valid and invalid stores", () => {
    it("chrome succeeds while firefox fails (missing jwtSecret)", async () => {
      const results = await Promise.allSettled([
        tryDeployStore({
          options: validInputs.chrome,
          store: "chrome"
        }),
        tryDeployStore({
          options: {
            extId: "addon@test",
            jwtIssuer: "iss"
          },
          store: "firefox"
        })
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
    });

    it("edge succeeds while opera fails (missing csrftoken)", async () => {
      const results = await Promise.allSettled([
        tryDeployStore({
          options: validInputs.edge,
          store: "edge"
        }),
        tryDeployStore({
          options: {
            packageId: 123,
            sessionid: "sess"
          },
          store: "opera"
        })
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("rejected");
    });

    it("three stores succeed while one fails", async () => {
      const results = await Promise.allSettled([
        tryDeployStore({
          options: validInputs.chrome,
          store: "chrome"
        }),
        tryDeployStore({
          options: validInputs.firefox,
          store: "firefox"
        }),
        tryDeployStore({
          options: {
            productId: "prod"
          },
          store: "edge"
        }),
        tryDeployStore({
          options: validInputs.opera,
          store: "opera"
        })
      ]);
      expect(results[0].status).toBe("fulfilled");
      expect(results[1].status).toBe("fulfilled");
      expect(results[2].status).toBe("rejected");
      expect(results[3].status).toBe("fulfilled");
    });

    it("all stores fail with empty configs", async () => {
      const results = await Promise.allSettled([
        tryDeployStore({
          options: {},
          store: "chrome"
        }),
        tryDeployStore({
          options: {},
          store: "firefox"
        }),
        tryDeployStore({
          options: {},
          store: "edge"
        }),
        tryDeployStore({
          options: {},
          store: "opera"
        })
      ]);
      for (const result of results) {
        expect(result.status).toBe("rejected");
      }
    });
  });
});
