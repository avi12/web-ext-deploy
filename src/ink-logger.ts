import { capitalCase, kebabCase, screamingSnakeCase } from "./case-conversion.js";
import { Colors } from "./logging.js";
import type { StoreLogger } from "./types.js";
import { z } from "zod";

type StoreStatus = "pending" | "running" | "success" | "error";

interface LogEntry {
  store: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: Date;
}

function createDeploymentUI(storeStatuses: Map<string, StoreStatus>, logEntries: LogEntry[]) {
  const completedCount = Array.from(storeStatuses.values()).filter(
    status => status === "success" || status === "error"
  ).length;
  const totalCount = storeStatuses.size;

  let output = "\x1b[36m\x1b[1mWeb Extension Deployment\x1b[0m\n\n";

  // Store Status Section
  for (const [store, status] of storeStatuses.entries()) {
    const symbol = getStatusSymbol(status);
    const statusText = getStatusText(status);
    output += `${symbol} ${store}: ${statusText}\n`;
  }

  output += "\n";

  // Progress Bar
  output += renderProgressBar(completedCount, totalCount) + "\n\n";

  // Recent Logs Section
  if (logEntries.length > 0) {
    output += "\x1b[90m\x1b[1mRecent Activity:\x1b[0m\n";

    for (const entry of logEntries.slice(-5)) {
      const color = entry.level === "error" ? "\x1b[31m" : entry.level === "warning" ? "\x1b[33m" : "\x1b[37m";
      output += `${color}[${entry.timestamp.toLocaleTimeString()}] ${entry.store}: ${entry.message}\x1b[0m\n`;
    }
  }

  return output;
}

function getStatusSymbol(status: StoreStatus) {
  switch (status) {
    case "pending":
      return "\x1b[34m○\x1b[0m";
    case "running":
      return "\x1b[36m●\x1b[0m";
    case "success":
      return "\x1b[32m✔\x1b[0m";
    case "error":
      return "\x1b[31m✖\x1b[0m";
  }
}

function getStatusText(status: StoreStatus) {
  switch (status) {
    case "pending":
      return "Waiting...";
    case "running":
      return "Deploying...";
    case "success":
      return "Published!";
    case "error":
      return "Failed";
  }
}

function renderProgressBar(current: number, total: number) {
  const percentage = Math.round((current / total) * 100);
  const barWidth = 30;
  const filled = Math.round((current / total) * barWidth);

  return `[${"█".repeat(filled)}${"░".repeat(barWidth - filled)}] ${percentage}%`;
}

export function createInkLogger(storeNames: string[]) {
  const storeStatuses = new Map<string, StoreStatus>();
  for (const store of storeNames) {
    storeStatuses.set(store, "pending");
  }

  const logEntries: LogEntry[] = [];
  let isMounted = true;

  function renderUI() {
    if (!isMounted) {
      return;
    }

    const output = createDeploymentUI(storeStatuses, logEntries);
    // Clear screen and move cursor to top, then render
    process.stdout.write("\x1b[2J\x1b[H" + output);
  }

  const logger = {
    info(store: string, message: string) {
      logEntries.push({
        store, level: "info", message, timestamp: new Date()
      });
      if (storeStatuses.get(store) === "pending") {
        storeStatuses.set(store, "running");
      }
      renderUI();
    },
    warning(store: string, message: string) {
      logEntries.push({
        store, level: "warning", message: `Warning: ${message}`, timestamp: new Date()
      });
      if (storeStatuses.get(store) === "pending") {
        storeStatuses.set(store, "running");
      }
      renderUI();
    },
    error(store: string, message: string) {
      logEntries.push({
        store, level: "error", message, timestamp: new Date()
      });
      storeStatuses.set(store, "error");
      renderUI();
    }
  };

  const monitor = {
    updateStore(store: string, status: StoreStatus, message?: string) {
      if (storeStatuses.get(store) === status) {
        return;
      }
      storeStatuses.set(store, status);
      if (message) {
        logEntries.push({
          store, level: status === "error" ? "error" : "info", message, timestamp: new Date()
        });
      }
      renderUI();
    },
    setZipPath(store: string, zipPath: string) {
      logEntries.push({
        store, level: "info", message: `ZIP: ${zipPath}`, timestamp: new Date()
      });
      if (storeStatuses.get(store) === "pending") {
        storeStatuses.set(store, "running");
      }
      renderUI();
    }
  };

  return {
    logger,
    monitor,
    forStore: (store: string) => ({
      info: msg => logger.info(capitalCase(store), msg),
      warning: msg => logger.warning(capitalCase(store), msg),
      error: msg => logger.error(capitalCase(store), msg)
    } satisfies StoreLogger),
    unmount() {
      isMounted = false;
    }
  };
}

export function renderStoreHelp(storeName: string, schema: z.ZodType, mode?: "cli" | "env", missingFields?: string[], dynamicFields?: string[], cliOverridableFields?: string[]) {
  if (!(schema instanceof z.ZodObject)) {
    return "";
  }

  const shape = schema.shape;
  function formatFieldName(key: string) {
    const isDynamic = dynamicFields?.includes(key);
    const isOverridable = cliOverridableFields?.includes(key);
    if (mode === "cli" || (mode === "env" && isDynamic)) {
      return `--${kebabCase(storeName)}-${kebabCase(key)}`;
    }
    if (mode === "env") {
      const envName = screamingSnakeCase(key);
      if (isOverridable) {
        return `${envName} / --${kebabCase(storeName)}-${kebabCase(key)}`;
      }
      return envName;
    }
    return key;
  }

  type FieldInfo = { name: string; type: string; isMissing: boolean; defaultValue: string; description: string };
  const fields: FieldInfo[] = [];

  for (const key in shape) {
    // verbose is a global flag, not per-store
    if (key === "verbose" && mode) {
      continue;
    }
    if (missingFields && !missingFields.includes(key)) {
      continue;
    }
    const zodValue = shape[key];
    const isOptional =
      zodValue instanceof z.ZodOptional || zodValue instanceof z.ZodNullable || zodValue instanceof z.ZodDefault;

    let defaultValue = "";
    let unwrapped = zodValue;
    while (unwrapped instanceof z.ZodOptional || unwrapped instanceof z.ZodNullable || unwrapped instanceof z.ZodDefault) {
      if (unwrapped instanceof z.ZodDefault) {
        defaultValue = String(unwrapped._def.defaultValue);
        unwrapped = unwrapped.removeDefault();
      } else {
        unwrapped = unwrapped.unwrap();
      }
    }

    let type = "string";
    if (unwrapped instanceof z.ZodBoolean) {
      type = "boolean";
    } else if (unwrapped instanceof z.ZodNumber) {
      type = "number";
    } else if (unwrapped instanceof z.ZodArray) {
      type = "array";
    }
    let description = zodValue.description || "";

    const defaultMatch = description.match(/\s*\(default:\s*(.+?)\)\s*$/i);
    if (defaultMatch) {
      defaultValue = defaultMatch[1];
      description = description.slice(0, defaultMatch.index);
    }

    fields.push({
      name: formatFieldName(key),
      type,
      isMissing: !isOptional,
      defaultValue,
      description
    });
  }

  const nameWidth = Math.max(10, ...fields.map(field => field.name.length)) + 2;
  const typeWidth = 10;
  const reqWidth = 10;
  const defaultWidth = Math.max(10, ...fields.map(field => field.defaultValue.length)) + 2;

  const title = mode === "env" ? `${storeName}.env` : `${capitalCase(storeName)} Store`;
  const header = missingFields
    ? `${Colors.Yellow}${title}${Colors.Reset}:\n`
    : `${Colors.Yellow}${title}${Colors.Reset} - Arguments:\n`;
  const colHeader = `  ${"Argument".padEnd(nameWidth)}${"Type".padEnd(typeWidth)}${"Required".padEnd(reqWidth)}${"Default".padEnd(defaultWidth)}Description\n`;
  const separator = `  ${"-".repeat(nameWidth + typeWidth + reqWidth + defaultWidth + 20)}\n`;

  let rows = "";
  for (const field of fields) {
    const reqMark = field.isMissing ? `${Colors.Green}✔${Colors.Reset}` : "";
    const reqPad = " ".repeat(field.isMissing ? reqWidth - 1 : reqWidth);
    const nameStr = field.isMissing ? `${Colors.Red}${field.name}${Colors.Reset}` : field.name;
    const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
    const defaultStr = field.defaultValue.padEnd(defaultWidth);
    rows += `  ${nameStr}${namePad}${field.type.padEnd(typeWidth)}${reqMark}${reqPad}${defaultStr}${field.description}\n`;
  }

  return `\n${header}${colHeader}${separator}${rows}`;
}

export function renderFatalError(message: string) {
  process.stdout.write(`\x1b[31m✖\x1b[0m ${message}\n`);
}

export function renderGlobalArgsHelp(schema: z.ZodType, missingArgs: string[], mode?: "cli" | "env") {
  if (missingArgs.length === 0 || !(schema instanceof z.ZodObject)) {
    return "";
  }

  function formatFieldName(key: string) {
    if (mode === "cli") {
      return `--${kebabCase(key)}`;
    }
    if (mode === "env") {
      return screamingSnakeCase(key);
    }
    return key;
  }

  const shape = schema.shape;
  type FieldInfo = { name: string; key: string; type: string; defaultValue: string; description: string };
  const fields: FieldInfo[] = [];

  for (const key in shape) {
    if (!missingArgs.includes(key)) {
      continue;
    }
    const zodValue = shape[key];
    let defaultValue = "";
    let unwrapped = zodValue;
    while (unwrapped instanceof z.ZodOptional || unwrapped instanceof z.ZodNullable || unwrapped instanceof z.ZodDefault) {
      if (unwrapped instanceof z.ZodDefault) {
        defaultValue = String(unwrapped._def.defaultValue);
        unwrapped = unwrapped.removeDefault();
      } else {
        unwrapped = unwrapped.unwrap();
      }
    }

    let type = "string";
    if (unwrapped instanceof z.ZodBoolean) {
      type = "boolean";
    } else if (unwrapped instanceof z.ZodNumber) {
      type = "number";
    } else if (unwrapped instanceof z.ZodArray) {
      type = "array";
    }
    let description = zodValue.description || "";

    const defaultMatch = description.match(/\s*\(default:\s*(.+?)\)\s*$/i);
    if (defaultMatch) {
      defaultValue = defaultMatch[1];
      description = description.slice(0, defaultMatch.index);
    }

    fields.push({
      name: formatFieldName(key),
      key,
      type,
      defaultValue,
      description
    });
  }

  if (fields.length === 0) {
    return "";
  }

  const nameWidth = Math.max(10, ...fields.map(field => field.name.length)) + 2;
  const typeWidth = 10;
  const reqWidth = 10;
  const defaultWidth = Math.max(10, ...fields.map(field => field.defaultValue.length)) + 2;

  const header = `${Colors.Yellow}Global Arguments${Colors.Reset}:\n`;
  const colHeader = `  ${"Argument".padEnd(nameWidth)}${"Type".padEnd(typeWidth)}${"Required".padEnd(reqWidth)}${"Default".padEnd(defaultWidth)}Description\n`;
  const separator = `  ${"-".repeat(nameWidth + typeWidth + reqWidth + defaultWidth + 20)}\n`;

  let rows = "";
  for (const field of fields) {
    const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
    rows += `  ${field.name}${namePad}${field.type.padEnd(typeWidth)}${"".padEnd(reqWidth)}${field.defaultValue.padEnd(defaultWidth)}${field.description}\n`;
  }

  return `\n${header}${colHeader}${separator}${rows}`;
}
