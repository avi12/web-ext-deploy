import { describe, it, expect } from "vitest";
import { generateJwt } from "../src/jwt.js";

describe("generateJwt", () => {
  const baseArgs = { jwtIssuer: "test-issuer",
    jwtSecret: "test-secret" };

  it("has 3 dot-separated parts", () => {
    const jwt = generateJwt(baseArgs);
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("header decodes to HS256/JWT", () => {
    const jwt = generateJwt(baseArgs);
    const header = JSON.parse(Buffer.from(jwt.split(".")[0], "base64").toString());
    expect(header).toEqual({ alg: "HS256",
      typ: "JWT" });
  });

  it("payload contains required fields", () => {
    const jwt = generateJwt(baseArgs);
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    expect(payload).toHaveProperty("iss");
    expect(payload).toHaveProperty("jti");
    expect(payload).toHaveProperty("iat");
    expect(payload).toHaveProperty("exp");
  });

  it("iss matches input jwtIssuer", () => {
    const jwt = generateJwt(baseArgs);
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    expect(payload.iss).toBe("test-issuer");
  });

  it("exp - iat equals default 180 seconds", () => {
    const jwt = generateJwt(baseArgs);
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    expect(payload.exp - payload.iat).toBe(180);
  });

  it("different secrets produce different signatures", () => {
    const jwt1 = generateJwt({ jwtIssuer: "iss",
      jwtSecret: "secret-a" });
    const jwt2 = generateJwt({ jwtIssuer: "iss",
      jwtSecret: "secret-b" });
    expect(jwt1.split(".")[2]).not.toBe(jwt2.split(".")[2]);
  });

  it("jti is a 32-char hex string", () => {
    const jwt = generateJwt(baseArgs);
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString());
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/);
  });
});
