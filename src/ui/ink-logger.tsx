import { getStoreDisplayName } from "../stores/registry.js";
import { StoreStatus, type StoreLogger } from "../types.js";
import { kebabCase, screamingSnakeCase } from "../utils/case-conversion.js";
import { getZodBaseType, getZodDefaultValue, getZodDescription, isZodOptional, unwrapZod } from "../utils/zod.js";
import { Colors } from "./logging.js";
import { Box, Newline, render, Text } from "ink";
import React, { useEffect, useState } from "react";
import { z } from "zod";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const RENDER_INTERVAL_MS = 80;

interface LogEntry {
  store: string;
  level: "info" | "warning" | "error";
  message: string;
  timestamp: Date;
}

const statusIcons: Partial<Record<StoreStatus, string>> = {
  [StoreStatus.Pending]: "○",
  [StoreStatus.Success]: "✔",
  [StoreStatus.Error]: "✖"
};

const statusColors: Record<StoreStatus, string> = {
  [StoreStatus.Pending]: "blue",
  [StoreStatus.Running]: "cyan",
  [StoreStatus.Success]: "green",
  [StoreStatus.Error]: "red"
};

const deployStatusTexts: Record<StoreStatus, string> = {
  [StoreStatus.Pending]: "Waiting...",
  [StoreStatus.Running]: "Deploying...",
  [StoreStatus.Success]: "Published!",
  [StoreStatus.Error]: "Failed"
};

const dryRunStatusTexts: Record<StoreStatus, string> = {
  [StoreStatus.Pending]: "Waiting...",
  [StoreStatus.Running]: "Validating...",
  [StoreStatus.Success]: "Valid",
  [StoreStatus.Error]: "Invalid"
};

const logLevelColors: Record<LogEntry["level"], string> = {
  info: "white",
  warning: "yellow",
  error: "red"
};

function stripAnsi(str: string) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

export function createInkLogger(storeNames: string[], isDryRun?: boolean) {
  const sharedStatuses: Record<string, StoreStatus> = Object.fromEntries(
    storeNames.map(store => [store, StoreStatus.Pending])
  );
  const sharedEntries: LogEntry[] = [];
  let triggerRender: (() => void) | null = null;
  let resolveReady!: () => void;
  let notifyAfterRender: (() => void) | null = null;
  const ready = new Promise<void>(resolve => {
    resolveReady = resolve;
  });

  function DeployUI() {
    const [, setTick] = useState(0);
    const [spinnerFrame, setSpinnerFrame] = useState(0);

    triggerRender = () => setTick(tick => tick + 1);

    useEffect(() => {
      resolveReady();
    }, []);

    useEffect(() => {
      notifyAfterRender?.();
      notifyAfterRender = null;
    });

    useEffect(() => {
      const interval = setInterval(() => {
        setSpinnerFrame(frame => (frame + 1) % SPINNER_FRAMES.length);
      }, RENDER_INTERVAL_MS);
      return () => clearInterval(interval);
    }, []);

    const successCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.Success).length;
    const errorCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.Error).length;
    const runningCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.Running).length;
    const pendingCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.Pending).length;
    const completedCount = successCount + errorCount;
    const totalCount = storeNames.length;

    const label = `${completedCount}/${totalCount}`;
    const barWidth = Math.max(10, (process.stdout.columns ?? 80) - label.length - 3);
    const successFilled = Math.round((successCount / totalCount) * barWidth);
    const errorFilled = Math.round((errorCount / totalCount) * barWidth);

    type SummaryPart = { text: string; color: string };
    const summaryParts: SummaryPart[] = [];
    if (successCount > 0) {
      summaryParts.push({ text: `✔ ${successCount} succeeded`, color: "green" });
    }
    if (errorCount > 0) {
      summaryParts.push({ text: `✖ ${errorCount} failed`, color: "red" });
    }
    if (runningCount > 0) {
      summaryParts.push({ text: `${SPINNER_FRAMES[spinnerFrame]} ${runningCount} ${isDryRun ? "validating" : "deploying"}`, color: "cyan" });
    }
    if (pendingCount > 0) {
      summaryParts.push({ text: `○ ${pendingCount} waiting`, color: "blue" });
    }

    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Web Extension Deployment</Text>
        <Newline />
        {Object.entries(sharedStatuses).map(([store, status]) => {
          const icon = status === StoreStatus.Running
            ? SPINNER_FRAMES[spinnerFrame]
            : (statusIcons[status] ?? "?");
          const statusText = isDryRun ? dryRunStatusTexts[status] : deployStatusTexts[status];
          return (
            <Text key={store}>
              <Text color={statusColors[status]}>{icon}</Text>
              {" "}{getStoreDisplayName(store)}: {statusText}
            </Text>
          );
        })}
        <Newline />
        <Box>
          <Text>[</Text>
          <Text color="green">{"█".repeat(successFilled)}</Text>
          <Text color="red">{"█".repeat(errorFilled)}</Text>
          <Text color="gray">{"░".repeat(Math.max(0, barWidth - successFilled - errorFilled))}</Text>
          <Text>] {label}</Text>
        </Box>
        <Box>
          {summaryParts.map((part, i) => (
            <React.Fragment key={part.color}>
              {i > 0 && <Text>{"  "}</Text>}
              <Text color={part.color}>{part.text}</Text>
            </React.Fragment>
          ))}
        </Box>
        {sharedEntries.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="gray">Recent Activity:</Text>
            {sharedEntries.slice(-(storeNames.length * 2 + 2)).map((entry, i) => (
              <Text key={i} color={logLevelColors[entry.level]}>
                [{entry.timestamp.toLocaleTimeString()}] {getStoreDisplayName(entry.store)}: {stripAnsi(entry.message)}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  }

  const inkInstance = render(<DeployUI />);

  function addLogEntry(entry: LogEntry) {
    sharedEntries.push(entry);
    if (sharedStatuses[entry.store] === StoreStatus.Pending) {
      sharedStatuses[entry.store] = StoreStatus.Running;
    }
    triggerRender?.();
  }

  const logger = {
    info(store: string, message: string) {
      addLogEntry({
        store,
        level: "info",
        message,
        timestamp: new Date()
      });
    },
    warning(store: string, message: string) {
      addLogEntry({
        store,
        level: "warning",
        message: `Warning: ${message}`,
        timestamp: new Date()
      });
    },
    error(store: string, message: string) {
      sharedEntries.push({
        store,
        level: "error",
        message,
        timestamp: new Date()
      });
      sharedStatuses[store] = StoreStatus.Error;
      triggerRender?.();
    }
  };

  const monitor = {
    updateStore(store: string, status: StoreStatus, message?: string) {
      if (sharedStatuses[store] === status) {
        return;
      }
      sharedStatuses[store] = status;
      if (message) {
        sharedEntries.push({
          store,
          level: status === StoreStatus.Error ? "error" : "info",
          message,
          timestamp: new Date()
        });
      }
      triggerRender?.();
    },
    setZipPath(store: string, zipPath: string) {
      addLogEntry({
        store,
        level: "info",
        message: `ZIP: ${zipPath}`,
        timestamp: new Date()
      });
    }
  };

  return {
    ready,
    logger,
    monitor,
    forStore: (store: string) => ({
      info: msg => logger.info(store, msg),
      warning: msg => logger.warning(store, msg),
      error: msg => logger.error(store, msg)
    } satisfies StoreLogger),
    waitForRender(): Promise<void> {
      return new Promise<void>(resolve => {
        notifyAfterRender = resolve;
        triggerRender?.();
      });
    },
    unmount() {
      inkInstance.unmount();
    }
  };
}

function unwrapZodType(zodValue: z.ZodTypeAny) {
  const rawDescription = getZodDescription(zodValue);
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
    const isOptional = isZodOptional(zodValue);
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

  const title = mode === "env" ? `${storeName}.env` : getStoreDisplayName(storeName);
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
