import fs from "node:fs";

export function parse(envContent: string) {
  const result: Record<string, string> = {};

  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
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
