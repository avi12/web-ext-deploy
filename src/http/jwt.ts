import { createHmac, randomBytes } from "node:crypto";

export function generateJwt({
  jwtIssuer,
  jwtSecret,
  expiresInSeconds = 60 * 3
}: {
  jwtIssuer: string;
  jwtSecret: string;
  expiresInSeconds?: number;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: jwtIssuer,
    jti: randomBytes(16).toString("hex"),
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds
  };

  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const headerBase64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const message = `${headerBase64}.${payloadBase64}`;
  const signature = createHmac("sha256", jwtSecret).update(message).digest("base64url");

  return `${message}.${signature}`;
}
