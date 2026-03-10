import { getStoreDisplayName } from "../stores/registry.js";
import { type StoreLogger, StoreStatus, type StoreName } from "../types.js";
import { kebabCase, screamingSnakeCase } from "../utils/case-conversion.js";
import {
  getZodBaseType,
  getZodDefaultValue,
  getZodDescription,
  isZodOptional,
  unwrapZod
} from "../utils/zod.js";
import { Box, Newline, render, Text } from "ink";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import React, { useEffect, useState } from "react";
import { z } from "zod";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const RENDER_INTERVAL_MS = 80;

enum LogLevel {
  Info = "info",
  Success = "success",
  Warning = "warning",
  Error = "error"
}

type LogSource = StoreName | "System";

export type LogEntry = {
  store: LogSource;
  level: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: Date;
};

const statusIcons = {
  pending: "○",
  success: "✔",
  error: "✖"
} as const;

const statusColors = {
  pending: "blue",
  running: "cyan",
  success: "green",
  error: "red"
} as const;

const deployStatusTexts = {
  pending: "Waiting...",
  running: "Deploying...",
  success: "Published!",
  error: "Failed"
} as const;

const dryRunStatusTexts = {
  pending: "Waiting...",
  running: "Validating...",
  success: "Valid",
  error: "Invalid"
} as const;

const logLevelColors = {
  info: "white",
  success: "green",
  warning: "yellow",
  error: "red"
} as const;

function stripAnsi(str: string) {
  return str.replace(/\u001b\[[0-9;]*m/g, "");
}

export type HelpField = { name: string; type: string; isMissing?: boolean; defaultValue: string; description: string };
export type HelpTableData = { title: string; fields: HelpField[] };

export class MissingArgsError extends Error {
  constructor(public readonly tables: HelpTableData[]) {
    super("Missing required arguments");
  }
}

export class NoStoresError extends Error {
  constructor(message: string, public readonly tables: HelpTableData[] = []) {
    super(message);
  }
}

function HelpTable({ data }: { data: HelpTableData }) {
  const { title, fields } = data;
  if (fields.length === 0) {
    return null;
  }

  const nameWidth = Math.max(10, ...fields.map(field => field.name.length)) + 2;
  const typeWidth = 10;
  const requiredWidth = 10;
  const defaultWidth = Math.max(10, ...fields.map(field => field.defaultValue.length)) + 2;

  return (
    <Box flexDirection="column">
      <Newline />
      <Text color="yellow">{title}:</Text>
      <Text>{"  "}{"Argument".padEnd(nameWidth)}{"Type".padEnd(typeWidth)}{"Required".padEnd(requiredWidth)}{"Default".padEnd(defaultWidth)}Description</Text>
      <Text>{"  "}{"-".repeat(nameWidth + typeWidth + requiredWidth + defaultWidth + 20)}</Text>
      {fields.map(field => {
        const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
        const requiredPad = " ".repeat(field.isMissing ? requiredWidth - 1 : requiredWidth);
        return (
          <Text key={field.name}>
            {"  "}
            <Text color={field.isMissing ? "red" : undefined}>{field.name}</Text>
            {`${namePad}${field.type.padEnd(typeWidth)}`}
            {field.isMissing ? <Text color="green">✔</Text> : null}
            {`${requiredPad}${field.defaultValue.padEnd(defaultWidth)}${field.description}`}
          </Text>
        );
      })}
    </Box>
  );
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

export function buildHelpTableData(
  storeName: StoreName,
  schema: z.ZodType,
  mode?: "cli" | "env",
  missingFields?: string[],
  dynamicFields?: string[],
  cliOverridableFields?: string[]
) {
  if (!(schema instanceof z.ZodObject)) {
    return null;
  }

  function formatFieldName(key: string) {
    const isDynamic = dynamicFields?.includes(key);
    const isOverridable = cliOverridableFields?.includes(key);
    if (mode === "cli" || (mode === "env" && isDynamic)) {
      return `--${kebabCase(storeName)}-${kebabCase(key)}`;
    }

    if (mode !== "env") {
      return key;
    }

    const envName = screamingSnakeCase(key);
    if (isOverridable) {
      return `${envName} / --${kebabCase(storeName)}-${kebabCase(key)}`;
    }

    return envName;
  }

  const fields: HelpField[] = [];

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
  return { title, fields };
}

export function buildGlobalHelpTableData(
  schema: z.ZodType,
  missingArgs: string[],
  mode?: "cli" | "env"
) {
  if (missingArgs.length === 0 || !(schema instanceof z.ZodObject)) {
    return null;
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

  const fields: HelpField[] = [];

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
    return null;
  }

  return { title: "Global Arguments", fields };
}

export function createPreDeployUI() {
  const messages: string[] = [];
  let triggerRender: (() => void) | null = null;

  function PreDeployUI() {
    const [, setTick] = useState(0);
    const [spinnerFrame, setSpinnerFrame] = useState(0);

    triggerRender = () => setTick(tick => tick + 1);

    useEffect(() => {
      const interval = setInterval(() => {
        setSpinnerFrame(frame => (frame + 1) % SPINNER_FRAMES.length);
      }, RENDER_INTERVAL_MS);
      return () => clearInterval(interval);
    }, []);

    if (messages.length === 0) {
      return null;
    }

    return (
      <Box flexDirection="column">
        {messages.map((message, i) => (
          <Text key={i}>{SPINNER_FRAMES[spinnerFrame]} {message}</Text>
        ))}
      </Box>
    );
  }

  const inkInstance = render(<PreDeployUI />);

  return {
    log(message: string) {
      messages.push(message);
      triggerRender?.();
    },
    unmount() {
      inkInstance.unmount();
    }
  };
}

export async function renderHelpTables(tables: HelpTableData[]) {
  if (tables.length === 0) {
    return;
  }

  let resolveRendered!: () => void;
  const rendered = new Promise<void>(resolve => {
    resolveRendered = resolve;
  });

  function HelpTablesUI() {
    useEffect(() => {
      resolveRendered();
    }, []);
    return (
      <Box flexDirection="column">
        {tables.map((table, i) => (
          <HelpTable key={i} data={table} />
        ))}
      </Box>
    );
  }

  const inkInstance = render(<HelpTablesUI />);
  await rendered;
  inkInstance.unmount();
}

export async function renderApplicationError(error: Error) {
  let resolveRendered!: () => void;
  const rendered = new Promise<void>(resolve => {
    resolveRendered = resolve;
  });

  function ErrorUI() {
    useEffect(() => {
      resolveRendered();
    }, []);

    if (error instanceof MissingArgsError || error instanceof NoStoresError) {
      return (
        <Box flexDirection="column">
          <Text><Text color="red">✖</Text> {error.message}</Text>
          {error.tables.map((table, i) => (
            <HelpTable key={i} data={table} />
          ))}
        </Box>
      );
    }

    return (
      <Box>
        <Text><Text color="red">✖</Text> {error.message}</Text>
      </Box>
    );
  }

  const inkInstance = render(<ErrorUI />);
  await rendered;
  inkInstance.unmount();
}

export function getRecentActivityEntries(storeNames: StoreName[], entries: LogEntry[]) {
  return storeNames.flatMap(store => entries.filter(entry => entry.store === store).slice(-2));
}

export function createInkLogger(storeNames: StoreName[], isDryRun?: boolean, isVerbose?: boolean) {
  const sharedStatuses: Partial<Record<StoreName, StoreStatus>> = {};
  for (const store of storeNames) {
    sharedStatuses[store] = StoreStatus.Pending;
  }
  const sharedEntries: LogEntry[] = [];
  let sharedHelpTables: HelpTableData[] = [];
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

    const activityEntries = isVerbose ? sharedEntries : sharedEntries.filter(entry => entry.level === LogLevel.Error);

    const label = `${completedCount}/${totalCount}`;
    const barWidth = Math.max(10, (process.stdout.columns ?? 80) - label.length - 3);
    const successFilled = Math.round((successCount / totalCount) * barWidth);
    const errorFilled = Math.round((errorCount / totalCount) * barWidth);

    type SummaryPart = { text: string; color: string };
    const summaryParts: SummaryPart[] = [];
    if (successCount > 0) {
      summaryParts.push({ text: `✔ ${successCount} succeeded`, color: statusColors.success });
    }

    if (errorCount > 0) {
      summaryParts.push({ text: `✖ ${errorCount} failed`, color: statusColors.error });
    }

    if (runningCount > 0) {
      summaryParts.push({ text: `${SPINNER_FRAMES[spinnerFrame]} ${runningCount} ${isDryRun ? "validating" : "deploying"}`, color: statusColors.running });
    }

    if (pendingCount > 0) {
      summaryParts.push({ text: `○ ${pendingCount} waiting`, color: statusColors.pending });
    }

    const allComplete = completedCount === totalCount;

    return (
      <Box flexDirection="column">
        <Text bold color="cyan">Web Extension Deployment</Text>
        <Newline />
        {storeNames.map(store => {
          const status = sharedStatuses[store] ?? StoreStatus.Pending;
          const icon = status === StoreStatus.Running
            ? SPINNER_FRAMES[spinnerFrame]
            : (statusIcons[status] ?? "?");
          const statusText = isDryRun ? dryRunStatusTexts[status] : deployStatusTexts[status];
          return (
            <Text key={store}>
              <Text color={statusColors[status]}>{icon}</Text>
              {" "}{getStoreDisplayName(store)}: <Text color={statusColors[status]}>{statusText}</Text>
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
            {getRecentActivityEntries(storeNames, activityEntries).map((entry, i) => (
              <Text key={i} color={logLevelColors[entry.level]}>
                [{entry.timestamp.toLocaleTimeString()}] {entry.store === "System" ? "System" : getStoreDisplayName(entry.store)}: {stripAnsi(entry.message)}
              </Text>
            ))}
          </Box>
        )}
        {allComplete && sharedHelpTables.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {sharedHelpTables.map((tableData, i) => (
              <HelpTable key={i} data={tableData} />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  const inkInstance = render(<DeployUI />);

  function addLogEntry(entry: LogEntry, overrideStatus?: StoreStatus) {
    sharedEntries.push(entry);

    if (entry.store !== "System") {
      if (overrideStatus !== undefined) {
        sharedStatuses[entry.store] = overrideStatus;
      } else if (sharedStatuses[entry.store] === StoreStatus.Pending) {
        sharedStatuses[entry.store] = StoreStatus.Running;
      }
    }

    triggerRender?.();
  }

  const logger = {
    info(store: LogSource, message: string) {
      addLogEntry({
        store,
        level: LogLevel.Info,
        message,
        timestamp: new Date()
      });
    },
    success(store: LogSource, message: string) {
      addLogEntry({
        store,
        level: LogLevel.Success,
        message,
        timestamp: new Date()
      });
    },
    warning(store: LogSource, message: string) {
      addLogEntry({
        store,
        level: LogLevel.Warning,
        message: `Warning: ${message}`,
        timestamp: new Date()
      });
    },
    error(store: LogSource, message: string) {
      addLogEntry({
        store,
        level: LogLevel.Error,
        message,
        timestamp: new Date()
      }, StoreStatus.Error);
    }
  };

  const monitor = {
    updateStore(store: StoreName, status: StoreStatus, message?: string) {
      if (sharedStatuses[store] === status) {
        return;
      }

      sharedStatuses[store] = status;

      if (message) {
        sharedEntries.push({
          store,
          level: status === StoreStatus.Error ? LogLevel.Error : LogLevel.Info,
          message,
          timestamp: new Date()
        });
      }

      triggerRender?.();
    },
    setZipPath(store: StoreName, zipPath: string) {
      addLogEntry({
        store,
        level: LogLevel.Info,
        message: `ZIP: ${zipPath}`,
        timestamp: new Date()
      });
    },
    setHelpTables(tables: HelpTableData[]) {
      sharedHelpTables = tables;
      triggerRender?.();
    }
  };

  return {
    ready,
    logger,
    monitor,
    forStore: (store: StoreName) => ({
      info: message => logger.info(store, message),
      warning: message => logger.warning(store, message),
      error: message => logger.error(store, message),
      async countdown(seconds, getMessage) {
        const entry: LogEntry = {
          store,
          level: LogLevel.Warning,
          message: `Warning: ${getMessage(seconds)}`,
          timestamp: new Date()
        };
        if (sharedStatuses[store] === StoreStatus.Pending) {
          sharedStatuses[store] = StoreStatus.Running;
        }

        sharedEntries.push(entry);
        triggerRender?.();
        for (let remaining = seconds - 1; remaining >= 0; remaining--) {
          await setTimeoutPromise(1000);
          entry.message = `Warning: ${getMessage(remaining)}`;
          triggerRender?.();
        }
      }
    } satisfies StoreLogger),
    waitForRender() {
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
