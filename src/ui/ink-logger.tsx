import { getStoreDisplayName } from "../stores/registry.js";
import { type StoreLogger, StoreStatus } from "../types.js";
import { kebabCase, screamingSnakeCase } from "../utils/case-conversion.js";
import { getZodBaseType, getZodDefaultValue, getZodDescription, isZodOptional, unwrapZod } from "../utils/zod.js";
import { green, red, yellow } from "./logging.js";
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

export function createInkLogger(storeNames: string[], isDryRun?: boolean, isVerbose?: boolean) {
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

    const activityEntries = isVerbose ? sharedEntries : sharedEntries.filter(entry => entry.level === "error");

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
        {activityEntries.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="gray">Recent Activity:</Text>
            {activityEntries.slice(-(storeNames.length * 2 + 2)).map((entry, i) => (
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

  function addLogEntry(entry: LogEntry, overrideStatus?: StoreStatus) {
    sharedEntries.push(entry);
    if (overrideStatus !== undefined) {
      sharedStatuses[entry.store] = overrideStatus;
    } else if (sharedStatuses[entry.store] === StoreStatus.Pending) {
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
      addLogEntry({
        store,
        level: "error",
        message,
        timestamp: new Date()
      }, StoreStatus.Error);
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
      info: message => logger.info(store, message),
      warning: message => logger.warning(store, message),
      error: message => logger.error(store, message)
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

type TableField = { name: string; type: string; isMissing?: boolean; defaultValue: string; description: string };

function buildTable(fields: TableField[], header: string) {
  const nameWidth = Math.max(10, ...fields.map(field => field.name.length)) + 2;
  const typeWidth = 10;
  const requiredWidth = 10;
  const defaultWidth = Math.max(10, ...fields.map(field => field.defaultValue.length)) + 2;

  const nameColumn = "Argument".padEnd(nameWidth);
  const typeColumn = "Type".padEnd(typeWidth);
  const requiredColumn = "Required".padEnd(requiredWidth);
  const defaultColumn = "Default".padEnd(defaultWidth);
  const columnHeader = `  ${nameColumn}${typeColumn}${requiredColumn}${defaultColumn}Description\n`;
  const separator = `  ${"-".repeat(nameWidth + typeWidth + requiredWidth + defaultWidth + 20)}\n`;

  const rows = fields.map(field => {
    const requiredMark = field.isMissing ? green("✔") : "";
    const requiredPad = " ".repeat(field.isMissing ? requiredWidth - 1 : requiredWidth);
    const nameText = field.isMissing ? red(field.name) : field.name;
    const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
    const typeText = field.type.padEnd(typeWidth);
    const defaultText = field.defaultValue.padEnd(defaultWidth);
    return `  ${nameText}${namePad}${typeText}${requiredMark}${requiredPad}${defaultText}${field.description}`;
  }).join("\n");

  return `\n${header}${columnHeader}${separator}${rows}\n`;
}

export function renderStoreHelp(storeName: string, schema: z.ZodType, mode?: "cli" | "env", missingFields?: string[], dynamicFields?: string[], cliOverridableFields?: string[]) {
  if (!(schema instanceof z.ZodObject)) {
    return "";
  }

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

  const fields: TableField[] = [];

  for (const key in schema.shape) {
    // verbose is a global flag, not per-store
    if (key === "verbose" && mode) {
      continue;
    }
    if (missingFields && !missingFields.includes(key)) {
      continue;
    }
    const zodValue = schema.shape[key];
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

  const title = mode === "env" ? `${storeName}.env` : getStoreDisplayName(storeName);
  const header = missingFields
    ? `${yellow(title)}:\n`
    : `${yellow(title)} - Arguments:\n`;

  return buildTable(fields, header);
}

export function renderFatalError(message: string) {
  process.stdout.write(`${red("✖")} ${message}\n`);
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

  const fields: TableField[] = [];

  for (const key in schema.shape) {
    if (!missingArgs.includes(key)) {
      continue;
    }
    const zodValue = (schema.shape)[key];
    const { type, defaultValue, description } = unwrapZodType(zodValue);

    fields.push({
      name: formatFieldName(key),
      type,
      defaultValue,
      description
    });
  }

  if (fields.length === 0) {
    return "";
  }

  const header = `${yellow("Global Arguments")}:\n`;
  return buildTable(fields, header);
}
