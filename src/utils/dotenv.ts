import fs from "node:fs";

export function parse(envContent: string) {
  const result: Record<string, string> = {};

  const keyPattern = `([^#=\\s][^=]*?)`;
  const valuePattern = `(.*?)`;
  const lineRegex = new RegExp(`^\\s*${keyPattern}\\s*=\\s*${valuePattern}\\s*$`, "gm");

  for (const [, key, raw] of envContent.matchAll(lineRegex)) {
    const quoteMatch = raw.match(/^(["'])(.*)\1$/);
    result[key] = quoteMatch ? quoteMatch[2] : raw;
  }

  return result;
}

export function config(options?: { path?: string }) {
  const path = options?.path || ".env";
  try {
    const content = fs.readFileSync(path, "utf8");
    return { parsed: parse(content) };
  } catch {
    return {};
  }
}
