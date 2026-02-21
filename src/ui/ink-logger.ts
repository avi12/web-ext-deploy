import { StoreStatus, type StoreLogger } from "../types.js";
import { capitalCase, kebabCase, screamingSnakeCase } from "../utils/case-conversion.js";
import { getZodBaseType, getZodDefaultValue, unwrapZod } from "../utils/zod.js";
import { Colors } from "./logging.js";
import { z } from "zod";

interface LogEntry {
  store: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: Date;
}

function createDeploymentUI(storeStatuses: Record<string, StoreStatus>, logEntries: LogEntry[]) {
  const statuses = Object.values(storeStatuses);
  const completedCount = statuses.filter(
    status => status === StoreStatus.Success || status === StoreStatus.Error
  ).length;
  const totalCount = statuses.length;

  const lines = [`${Colors.Cyan}${Colors.Bold}Web Extension Deployment${Colors.Reset}\n`];

  // Store Status Section
  for (const [store, status] of Object.entries(storeStatuses)) {
    const symbol = statusSymbols[status];
    const statusText = statusTexts[status];
    lines.push(`${symbol} ${store}: ${statusText}`);
  }

  lines.push("");

  // Progress Bar
  lines.push(renderProgressBar(completedCount, totalCount), "");

  // Recent Logs Section
  if (logEntries.length > 0) {
    lines.push(`${Colors.Gray}${Colors.Bold}Recent Activity:${Colors.Reset}`);

    for (const entry of logEntries.slice(-5)) {
      const color = logLevelColors[entry.level];
      lines.push(`${color}[${entry.timestamp.toLocaleTimeString()}] ${entry.store}: ${entry.message}${Colors.Reset}`);
    }
  }

  return lines.join("\n");
}

const statusSymbols: Record<StoreStatus, string> = {
  [StoreStatus.Pending]: `${Colors.Blue}○${Colors.Reset}`,
  [StoreStatus.Running]: `${Colors.Cyan}●${Colors.Reset}`,
  [StoreStatus.Success]: `${Colors.Green}✔${Colors.Reset}`,
  [StoreStatus.Error]: `${Colors.Red}✖${Colors.Reset}`
};

const statusTexts: Record<StoreStatus, string> = {
  [StoreStatus.Pending]: "Waiting...",
  [StoreStatus.Running]: "Deploying...",
  [StoreStatus.Success]: "Published!",
  [StoreStatus.Error]: "Failed"
};

const logLevelColors: Record<LogEntry["level"], string> = {
  info: Colors.White,
  warning: Colors.Yellow,
  error: Colors.Red
};

function renderProgressBar(current: number, total: number) {
  const percentage = Math.round((current / total) * 100);
  const barWidth = 30;
  const filled = Math.round((current / total) * barWidth);

  return `[${"█".repeat(filled)}${"░".repeat(barWidth - filled)}] ${percentage}%`;
}

export function createInkLogger(storeNames: string[]) {
  const storeStatuses: Record<string, StoreStatus> = Object.fromEntries(
    storeNames.map(store => [store, StoreStatus.Pending])
  );

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
      if (storeStatuses[store] === StoreStatus.Pending) {
        storeStatuses[store] = StoreStatus.Running;
      }
      renderUI();
    },
    warning(store: string, message: string) {
      logEntries.push({
        store, level: "warning", message: `Warning: ${message}`, timestamp: new Date()
      });
      if (storeStatuses[store] === StoreStatus.Pending) {
        storeStatuses[store] = StoreStatus.Running;
      }
      renderUI();
    },
    error(store: string, message: string) {
      logEntries.push({
        store, level: "error", message, timestamp: new Date()
      });
      storeStatuses[store] = StoreStatus.Error;
      renderUI();
    }
  };

  const monitor = {
    updateStore(store: string, status: StoreStatus, message?: string) {
      if (storeStatuses[store] === status) {
        return;
      }
      storeStatuses[store] = status;
      if (message) {
        logEntries.push({
          store, level: status === StoreStatus.Error ? "error" : "info", message, timestamp: new Date()
        });
      }
      renderUI();
    },
    setZipPath(store: string, zipPath: string) {
      logEntries.push({
        store, level: "info", message: `ZIP: ${zipPath}`, timestamp: new Date()
      });
      if (storeStatuses[store] === StoreStatus.Pending) {
        storeStatuses[store] = StoreStatus.Running;
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

function unwrapZodType(zodValue: z.ZodTypeAny) {
  const rawDescription = zodValue.description || "";
  const defaultMatch = rawDescription.match(/\s*\(default:\s*(.+?)\)\s*$/i);

  const type = getZodBaseType(unwrapZod(zodValue));
  const schemaDefault = getZodDefaultValue(zodValue);

  let defaultValue = "";
  if (defaultMatch) {
    defaultValue = defaultMatch[1];
  } else if (schemaDefault !== undefined) {
    defaultValue = String(schemaDefault);
  }

  const description = defaultMatch ? rawDescription.slice(0, defaultMatch.index) : rawDescription;

  return { type, defaultValue, description };
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
    const { type, defaultValue, description } = unwrapZodType(zodValue);

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

  const rows = fields.map(field => {
    const reqMark = field.isMissing ? `${Colors.Green}✔${Colors.Reset}` : "";
    const reqPad = " ".repeat(field.isMissing ? reqWidth - 1 : reqWidth);
    const nameStr = field.isMissing ? `${Colors.Red}${field.name}${Colors.Reset}` : field.name;
    const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
    const defaultStr = field.defaultValue.padEnd(defaultWidth);
    return `  ${nameStr}${namePad}${field.type.padEnd(typeWidth)}${reqMark}${reqPad}${defaultStr}${field.description}`;
  }).join("\n");

  return `\n${header}${colHeader}${separator}${rows}\n`;
}

export function renderFatalError(message: string) {
  process.stdout.write(`${Colors.Red}✖${Colors.Reset} ${message}\n`);
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
    const { type, defaultValue, description } = unwrapZodType(zodValue);

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

  const rows = fields.map(field => {
    const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
    return `  ${field.name}${namePad}${field.type.padEnd(typeWidth)}${"".padEnd(reqWidth)}${field.defaultValue.padEnd(defaultWidth)}${field.description}`;
  }).join("\n");

  return `\n${header}${colHeader}${separator}${rows}\n`;
}
