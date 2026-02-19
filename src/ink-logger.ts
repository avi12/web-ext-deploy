import { z } from "zod";
import { capitalCase, kebabCase, screamingSnakeCase } from "./case-conversion.js";
import { Colors } from "./logging.js";

export type StoreStatus = "pending" | "running" | "success" | "error";

export interface LogEntry {
  store: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: Date;
}

export type InkLogger = {
  info: (store: string, message: string) => void;
  warning: (store: string, message: string) => void;
  error: (store: string, message: string) => void;
};

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

export type MonitorApi = {
  updateStore: (store: string, status: StoreStatus, message?: string) => void;
  setZipPath: (store: string, zipPath: string) => void;
};

export function createInkLogger(storeNames: string[]) {
  const storeStatuses = new Map<string, StoreStatus>();
  storeNames.forEach(store => {
    storeStatuses.set(store, "pending");
  });

  const logEntries: LogEntry[] = [];
  let mounted = true;

  function renderUI() {
    if (!mounted) {
      return;
    }

    const ui = createDeploymentUI(storeStatuses, logEntries);
    // Clear screen and move cursor to top, then render
    process.stdout.write("\x1b[2J\x1b[H" + ui);
  }

  return {
    logger: {
      info: (store: string, message: string) => {
        const entry: LogEntry = {
          store,
          level: "info",
          message,
          timestamp: new Date()
        };
        logEntries.push(entry);

        if (storeStatuses.get(store) === "pending") {
          storeStatuses.set(store, "running");
        }

        renderUI();
      },
      warning: (store: string, message: string) => {
        const entry: LogEntry = {
          store,
          level: "warning",
          message: `Warning: ${message}`,
          timestamp: new Date()
        };
        logEntries.push(entry);

        if (storeStatuses.get(store) === "pending") {
          storeStatuses.set(store, "running");
        }

        renderUI();
      },
      error: (store: string, message: string) => {
        const entry: LogEntry = {
          store,
          level: "error",
          message,
          timestamp: new Date()
        };
        logEntries.push(entry);

        storeStatuses.set(store, "error");

        renderUI();
      }
    },
    monitor: {
      updateStore: (store: string, status: StoreStatus, message?: string) => {
        const currentStatus = storeStatuses.get(store);
        if (currentStatus !== status) {
          storeStatuses.set(store, status);

          if (message) {
            const entry: LogEntry = {
              store,
              level: status === "error" ? "error" : "info",
              message,
              timestamp: new Date()
            };
            logEntries.push(entry);
          }

          renderUI();
        }
      },
      setZipPath: (store: string, zipPath: string) => {
        // For now, just log the zip path as a message
        const entry: LogEntry = {
          store,
          level: "info",
          message: `ZIP: ${zipPath}`,
          timestamp: new Date()
        };
        logEntries.push(entry);

        if (storeStatuses.get(store) === "pending") {
          storeStatuses.set(store, "running");
        }

        renderUI();
      }
    },
    unmount: () => {
      mounted = false;
    }
  };
}

export function renderStoreHelp(storeName: string, schema: z.ZodType, mode?: "cli" | "env") {
  if (!(schema instanceof z.ZodObject)) {
    return "";
  }

  const shape = schema.shape;
  const formatFieldName = (key: string) => {
    if (mode === "cli") {
      return `--${kebabCase(storeName)}-${kebabCase(key)}`;
    }
    if (mode === "env") {
      return screamingSnakeCase(key);
    }
    return key;
  };

  type FieldInfo = { name: string; type: string; required: boolean; description: string };
  const fields: FieldInfo[] = [];

  for (const [key, value] of Object.entries(shape)) {
    // verbose is a global flag, not per-store
    if (key === "verbose" && mode) {
      continue;
    }
    const zodValue = value as z.ZodTypeAny;
    const isOptional =
      zodValue instanceof z.ZodOptional || zodValue instanceof z.ZodNullable || zodValue instanceof z.ZodDefault;

    const innerValue =
      zodValue instanceof z.ZodOptional || zodValue instanceof z.ZodNullable ? zodValue.unwrap() : zodValue;
    let type = "string";
    if (innerValue instanceof z.ZodBoolean) {
      type = "boolean";
    } else if (innerValue instanceof z.ZodNumber) {
      type = "number";
    } else if (innerValue instanceof z.ZodArray) {
      type = "array";
    }

    fields.push({ name: formatFieldName(key),
      type,
      required: !isOptional,
      description: zodValue.description || "" });
  }

  const nameWidth = Math.max(10, ...fields.map(f => f.name.length)) + 2;
  const typeWidth = 10;
  const reqWidth = 10;

  const header = `${Colors.Yellow}${capitalCase(storeName)} Store${Colors.Reset} — Arguments:\n`;
  const colHeader = `  ${"Argument".padEnd(nameWidth)}${"Type".padEnd(typeWidth)}${"Required".padEnd(reqWidth)}Description\n`;
  const separator = `  ${"─".repeat(nameWidth + typeWidth + reqWidth + 20)}\n`;

  let rows = "";
  for (const f of fields) {
    const reqMark = f.required ? `${Colors.Green}✔${Colors.Reset}` : "";
    const nameStr = f.required ? `${Colors.Red}${f.name}${Colors.Reset}` : f.name;
    // Pad based on raw name length since ANSI codes are invisible
    const namePad = " ".repeat(Math.max(0, nameWidth - f.name.length));
    rows += `  ${nameStr}${namePad}${f.type.padEnd(typeWidth)}${reqMark.padEnd(reqWidth + (reqMark.length - 1))}${f.description}\n`;
  }

  return `\n${header}${colHeader}${separator}${rows}`;
}
