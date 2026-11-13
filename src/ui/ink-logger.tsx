import { setTimeout as setTimeoutPromise } from "node:timers/promises";

import { Box, Newline, render, Text } from "ink";
import React, { useEffect, useState } from "react";
import { z } from "zod";

import { getStoreDisplayName } from "@/stores/registry.js";
import { type StoreLogger, type StoreName, StoreStatus } from "@/types.js";
import { kebabCase, screamingSnakeCase } from "@/utils/case-conversion.js";
import { getZodBaseType, getZodDefaultValue, getZodDescription, isZodOptional, unwrapZod } from "@/utils/zod.js";

const HELP_TABLE_RULE_PADDING = 20;
const ESCAPE_CODE = 27;
const COUNTDOWN_TICK_MS = 1000;

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const RENDER_INTERVAL_MS = 80;

enum LogLevel {
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error"
}

type LogSource = StoreName | "System";

export interface LogEntry {
  store: LogSource;
  level: "info" | "success" | "warning" | "error";
  message: string;
  timestamp: Date;
}

const statusIcons = {
  [StoreStatus.PENDING]: "○",
  [StoreStatus.SUCCESS]: "✔",
  [StoreStatus.ERROR]: "✖"
} as const;

const statusColors = {
  [StoreStatus.PENDING]: "blue",
  [StoreStatus.RUNNING]: "cyan",
  [StoreStatus.SUCCESS]: "green",
  [StoreStatus.ERROR]: "red"
} as const;

const deployStatusTexts = {
  [StoreStatus.PENDING]: "Waiting...",
  [StoreStatus.RUNNING]: "Deploying...",
  [StoreStatus.SUCCESS]: "Published!",
  [StoreStatus.ERROR]: "Failed"
} as const;

const dryRunStatusTexts = {
  [StoreStatus.PENDING]: "Waiting...",
  [StoreStatus.RUNNING]: "Validating...",
  [StoreStatus.SUCCESS]: "Valid",
  [StoreStatus.ERROR]: "Invalid"
} as const;

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`${String.fromCharCode(ESCAPE_CODE)}\[[0-9;]*m`, "g");

function stripAnsi(str: string) {
  return str.replace(ANSI_ESCAPE_PATTERN, "");
}

export interface HelpField {
  name: string;
  type: string;
  isRequired: boolean;
  isMissing?: boolean;
  defaultValue: string;
  description: string;
}
export interface HelpTableData {
  title: string;
  fields: HelpField[];
}

interface WrapAccumulator {
  lines: string[];
  current: string;
}

// An over-long word (e.g. a URL) is kept whole on its own line rather than split.
function flushLongWord({ accumulator, word }: { accumulator: WrapAccumulator; word: string }) {
  if (accumulator.current) {
    accumulator.lines.push(accumulator.current);
  }

  accumulator.lines.push(word);
  accumulator.current = "";
}

function placeWord({ accumulator, word, width }: { accumulator: WrapAccumulator; word: string; width: number }) {
  if (word.length > width) {
    flushLongWord({
      accumulator,
      word
    });
    return;
  }

  if (!accumulator.current) {
    accumulator.current = word;
    return;
  }

  if (accumulator.current.length + 1 + word.length <= width) {
    accumulator.current += ` ${word}`;
    return;
  }

  accumulator.lines.push(accumulator.current);
  accumulator.current = word;
}

// Word-wrap to `width`, keeping any single over-long word (e.g. a URL) intact on its
// own line rather than splitting it, even if that line overflows `width`.
function wrapText({ text, width }: { text: string; width: number }) {
  const accumulator: WrapAccumulator = {
    lines: [],
    current: ""
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    placeWord({
      accumulator,
      word,
      width
    });
  }

  if (accumulator.current) {
    accumulator.lines.push(accumulator.current);
  }

  return accumulator.lines.length > 0 ? accumulator.lines : [text];
}

export class MissingArgsError extends Error {
  constructor(readonly tables: HelpTableData[]) {
    super("Missing required arguments");
  }
}

export class NoStoresError extends Error {
  constructor(
    message: string,
    readonly tables: HelpTableData[] = []
  ) {
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
  const descriptionIndent = 2 + nameWidth + typeWidth + requiredWidth + defaultWidth;
  const descriptionWidth = Math.max(24, (process.stdout.columns ?? 80) - descriptionIndent);

  return (
    <Box flexDirection="column">
      <Newline />
      <Text color="yellow">{title}:</Text>
      <Text>
        {"  "}
        {"Argument".padEnd(nameWidth)}
        {"Type".padEnd(typeWidth)}
        {"Required".padEnd(requiredWidth)}
        {"Default".padEnd(defaultWidth)}Description
      </Text>
      <Text>
        {"  "}
        {"-".repeat(nameWidth + typeWidth + requiredWidth + defaultWidth + HELP_TABLE_RULE_PADDING)}
      </Text>
      {fields.map(field => {
        const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
        const requiredPad = " ".repeat(field.isRequired ? requiredWidth - 1 : requiredWidth);
        const [firstLine = "", ...continuationLines] = wrapText({
          text: field.description,
          width: descriptionWidth
        });
        return (
          <React.Fragment key={field.name}>
            <Text>
              {"  "}
              <Text color={field.isMissing ? "red" : undefined}>{field.name}</Text>
              {`${namePad}${field.type.padEnd(typeWidth)}`}
              {field.isRequired ? <Text color="green">✔</Text> : null}
              {`${requiredPad}${field.defaultValue.padEnd(defaultWidth)}${firstLine}`}
            </Text>
            {continuationLines.map((line, index) => {
              // A line wider than the column is an over-long word kept whole (e.g. a URL);
              // drop it to column 0 for the full width instead of an almost-empty indented row.
              const indent = line.length > descriptionWidth ? 0 : descriptionIndent;
              return <Text key={index}>{`${" ".repeat(indent)}${line}`}</Text>;
            })}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

export function unwrapZodType(zodValue: z.ZodTypeAny) {
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

  return {
    type,
    defaultValue,
    description
  };
}

export function buildHelpTableData({
  storeName,
  schema,
  mode,
  missingFields,
  dynamicFields,
  cliOverridableFields
}: {
  storeName: StoreName;
  schema: z.ZodType;
  mode?: "cli" | "env";
  missingFields?: string[];
  dynamicFields?: string[];
  cliOverridableFields?: string[];
}) {
  if (!(schema instanceof z.ZodObject)) {
    return null;
  }

  function formatFieldName(key: string) {
    const isDynamic = dynamicFields?.includes(key);
    const isOverridable = cliOverridableFields?.includes(key);
    const isCliMode = mode === "cli";
    const isDynamicEnvField = mode === "env" && isDynamic;
    if (isCliMode || isDynamicEnvField) {
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

  for (const key of Object.keys(schema.shape)) {
    // verbose is a global flag, not per-store
    const isVerboseInStoreContext = key === "verbose" && Boolean(mode);
    if (isVerboseInStoreContext) {
      continue;
    }

    const isFilteredOut = Boolean(missingFields) && !missingFields?.includes(key);
    if (isFilteredOut) {
      continue;
    }

    const zodValue = schema.shape[key];
    const isOptional = isZodOptional(zodValue);
    const { type, defaultValue, description } = unwrapZodType(zodValue);

    fields.push({
      name: formatFieldName(key),
      type,
      isRequired: !isOptional,
      isMissing: missingFields?.includes(key),
      defaultValue,
      description
    });
  }

  const title = mode === "env" ? `${storeName}.env` : getStoreDisplayName(storeName);
  return {
    title,
    fields
  };
}

export function buildGlobalHelpTableData({
  schema,
  missingArgs,
  mode
}: {
  schema: z.ZodType;
  missingArgs: string[];
  mode?: "cli" | "env";
}) {
  const hasNoArgs = missingArgs.length === 0;
  const isNotObjectSchema = !(schema instanceof z.ZodObject);
  if (hasNoArgs || isNotObjectSchema) {
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

  for (const key of Object.keys(schema.shape)) {
    if (!missingArgs.includes(key)) {
      continue;
    }

    const zodValue = schema.shape[key];
    const { type, defaultValue, description } = unwrapZodType(zodValue);

    fields.push({
      name: formatFieldName(key),
      type,
      isRequired: true,
      isMissing: true,
      defaultValue,
      description
    });
  }

  if (fields.length === 0) {
    return null;
  }

  return {
    title: "Global Arguments",
    fields
  };
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
          <Text key={i}>
            {SPINNER_FRAMES[spinnerFrame]} {message}
          </Text>
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

    const isHelpableError = error instanceof MissingArgsError || error instanceof NoStoresError;
    if (isHelpableError) {
      return (
        <Box flexDirection="column">
          <Text>
            <Text color="red">✖</Text> {error.message}
          </Text>
          {error.tables.map((table, i) => (
            <HelpTable key={i} data={table} />
          ))}
        </Box>
      );
    }

    return (
      <Box>
        <Text>
          <Text color="red">✖</Text> {error.message}
        </Text>
      </Box>
    );
  }

  const inkInstance = render(<ErrorUI />);
  await rendered;
  inkInstance.unmount();
}

export function createInkLogger({ storeNames, isDryRun }: { storeNames: StoreName[]; isDryRun?: boolean }) {
  const sharedStatuses: Partial<Record<StoreName, StoreStatus>> = {};
  for (const store of storeNames) {
    sharedStatuses[store] = StoreStatus.PENDING;
  }
  const sharedEntries: LogEntry[] = [];
  const sharedExtensionNames: Partial<Record<StoreName, string>> = {};
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

    const successCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.SUCCESS).length;
    const errorCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.ERROR).length;
    const runningCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.RUNNING).length;
    const pendingCount = Object.values(sharedStatuses).filter(status => status === StoreStatus.PENDING).length;
    const completedCount = successCount + errorCount;
    const totalCount = storeNames.length;

    const label = `${completedCount}/${totalCount}`;
    const barWidth = Math.max(10, (process.stdout.columns ?? 80) - label.length - 3);
    const successFilled = Math.round((successCount / totalCount) * barWidth);
    const errorFilled = Math.round((errorCount / totalCount) * barWidth);

    interface SummaryPart {
      text: string;
      color: string;
    }
    const summaryParts: SummaryPart[] = [];
    if (successCount > 0) {
      summaryParts.push({
        text: `✔ ${successCount} succeeded`,
        color: statusColors[StoreStatus.SUCCESS]
      });
    }

    if (errorCount > 0) {
      summaryParts.push({
        text: `✖ ${errorCount} failed`,
        color: statusColors[StoreStatus.ERROR]
      });
    }

    if (runningCount > 0) {
      summaryParts.push({
        text: `${SPINNER_FRAMES[spinnerFrame]} ${runningCount} ${isDryRun ? "validating" : "deploying"}`,
        color: statusColors[StoreStatus.RUNNING]
      });
    }

    if (pendingCount > 0) {
      summaryParts.push({
        text: `○ ${pendingCount} waiting`,
        color: statusColors[StoreStatus.PENDING]
      });
    }

    const isAllComplete = completedCount === totalCount;

    return (
      <Box flexDirection="column">
        <Text bold color="cyan">
          Web Extension Deployment
        </Text>
        <Newline />
        {storeNames.map(store => {
          const status = sharedStatuses[store] ?? StoreStatus.PENDING;
          const icon = status === StoreStatus.RUNNING ? SPINNER_FRAMES[spinnerFrame] : (statusIcons[status] ?? "?");
          const storeEntries = sharedEntries.filter(entry => entry.store === store);
          const latestEntry = storeEntries[storeEntries.length - 1];
          const firstErrorEntry = storeEntries.find(entry => entry.level === LogLevel.ERROR);
          const defaultStatusText = isDryRun ? dryRunStatusTexts[status] : deployStatusTexts[status];
          let statusText: string = defaultStatusText;
          if (status === StoreStatus.RUNNING && latestEntry) {
            statusText = stripAnsi(latestEntry.message).split("\n")[0];
          } else if (status === StoreStatus.ERROR && firstErrorEntry) {
            statusText = stripAnsi(firstErrorEntry.message).split("\n")[0];
          }

          const extensionName = sharedExtensionNames[store];
          return (
            <Text key={store}>
              <Text color={statusColors[status]}>{icon}</Text> {getStoreDisplayName(store)}
              {extensionName ? ` (${extensionName})` : ""}: <Text color={statusColors[status]}>{statusText}</Text>
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
        {isAllComplete && sharedHelpTables.length > 0 && (
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

  function addLogEntry({ entry, overrideStatus }: { entry: LogEntry; overrideStatus?: StoreStatus }) {
    sharedEntries.push(entry);

    if (entry.store !== "System") {
      if (overrideStatus !== undefined) {
        sharedStatuses[entry.store] = overrideStatus;
      } else if (sharedStatuses[entry.store] === StoreStatus.PENDING) {
        sharedStatuses[entry.store] = StoreStatus.RUNNING;
      }
    }

    triggerRender?.();
  }

  const logger = {
    info(store: LogSource, message: string) {
      addLogEntry({
        entry: {
          store,
          level: LogLevel.INFO,
          message,
          timestamp: new Date()
        }
      });
    },
    success(store: LogSource, message: string) {
      addLogEntry({
        entry: {
          store,
          level: LogLevel.SUCCESS,
          message,
          timestamp: new Date()
        }
      });
    },
    warning(store: LogSource, message: string) {
      addLogEntry({
        entry: {
          store,
          level: LogLevel.WARNING,
          message,
          timestamp: new Date()
        }
      });
    },
    error(store: LogSource, message: string) {
      addLogEntry({
        entry: {
          store,
          level: LogLevel.ERROR,
          message,
          timestamp: new Date()
        },
        overrideStatus: StoreStatus.ERROR
      });
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
          level: status === StoreStatus.ERROR ? LogLevel.ERROR : LogLevel.INFO,
          message,
          timestamp: new Date()
        });
      }

      triggerRender?.();
    },
    setExtensionName(store: StoreName, name: string) {
      sharedExtensionNames[store] = name;
      triggerRender?.();
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
    forStore: (store: StoreName) =>
      ({
        info: message => logger.info(store, message),
        warning: message => logger.warning(store, message),
        error: message => logger.error(store, message),
        async countdown(seconds, getMessage) {
          const entry: LogEntry = {
            store,
            level: LogLevel.WARNING,
            message: getMessage(seconds),
            timestamp: new Date()
          };
          if (sharedStatuses[store] === StoreStatus.PENDING) {
            sharedStatuses[store] = StoreStatus.RUNNING;
          }

          sharedEntries.push(entry);
          triggerRender?.();
          for (let remaining = seconds - 1; remaining > 0; remaining--) {
            await setTimeoutPromise(COUNTDOWN_TICK_MS);
            entry.message = getMessage(remaining);
            triggerRender?.();
          }
        }
      }) satisfies StoreLogger,
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
