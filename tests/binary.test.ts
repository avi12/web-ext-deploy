import { spawnSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const BINARY = path.join(ROOT, "dist-esm/cli.js");
const FIXTURE_ZIP = path.resolve(__dirname, "fixtures/test.zip");
const EMPTY_DIR = mkdtempSync(path.join(os.tmpdir(), "web-ext-deploy-test-"));

beforeAll(() => {
  if (!existsSync(BINARY)) {
    execSync("pnpm build", { cwd: ROOT, stdio: "ignore" });
  }
}, 60000);

function runCli(args: string[], cwd = ROOT) {
  return spawnSync(process.execPath, [BINARY, ...args], {
    cwd,
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
    const { status, stdout } = runCli(["env"], EMPTY_DIR);
    expect(status).not.toBe(0);
    expect(stdout).toContain("No .env files found");
  });

  it("env --help exits 0 and shows store tables", () => {
    const { status, stdout } = runCli(["env", "--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("chrome.env");
    expect(stdout).toContain("firefox.env");
    expect(stdout).toContain("edge.env");
    expect(stdout).toContain("opera.env");
  });

  it("cli --dry-run with valid chrome args exits 0", () => {
    const { status } = runCli([
      "cli",
      "--dry-run",
      "--chrome-ext-id", "abc123",
      "--chrome-publisher-id", "pub-456",
      "--chrome-client-id", "client-id",
      "--chrome-client-secret", "client-secret",
      "--chrome-refresh-token", "token-xyz",
      `--chrome-zip=${FIXTURE_ZIP}`
    ]);
    expect(status).toBe(0);
  });
});
