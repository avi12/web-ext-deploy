import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const BINARY = path.join(ROOT, "dist-esm/index.js");
const FIXTURE_ZIP = path.resolve(__dirname, "fixtures/test.zip");

beforeAll(() => {
  if (!existsSync(BINARY)) {
    execSync("pnpm build", { cwd: ROOT, stdio: "ignore" });
  }
}, 60000);

function runCli(args: string[]) {
  return spawnSync(process.execPath, [BINARY, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 15000
  });
}

describe("binary", () => {
  it("exits non-zero with no command", () => {
    const { status, stdout, stderr } = runCli([]);
    expect(status).not.toBe(0);
    expect(stdout + stderr).toContain("You need at least one command");
  });

  it("--help exits 0 and prints usage", () => {
    const { status, stdout } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("web-ext-deploy");
  });

  it("cli with no store args exits non-zero", () => {
    const { status, stdout } = runCli(["cli"]);
    expect(status).not.toBe(0);
    expect(stdout).toContain("Supply arguments for at least one store");
  });

  it("env with no .env files exits non-zero", () => {
    const { status, stdout } = runCli(["env"]);
    expect(status).not.toBe(0);
    expect(stdout).toContain("Supply arguments for at least one store");
  });

  it("cli --dry-run with valid chrome args exits 0", () => {
    const { status } = runCli([
      "cli",
      "--dry-run",
      "--chrome-ext-id", "abc123",
      "--chrome-publisher-id", "pub-456",
      "--chrome-refresh-token", "token-xyz",
      `--chrome-zip=${FIXTURE_ZIP}`
    ]);
    expect(status).toBe(0);
  });
});
