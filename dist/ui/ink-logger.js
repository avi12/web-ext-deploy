import { getStoreDisplayName } from "../stores/registry.js";
import { StoreStatus } from "../types.js";
import { kebabCase, screamingSnakeCase } from "../utils/case-conversion.js";
import { getZodBaseType, getZodDefaultValue, getZodDescription, isZodOptional, unwrapZod } from "../utils/zod.js";
import { Box, Newline, render, Text } from "ink";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import React, { useEffect, useState } from "react";
import { z } from "zod";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const RENDER_INTERVAL_MS = 80;
var LogLevel;
(function (LogLevel) {
    LogLevel["Info"] = "info";
    LogLevel["Warning"] = "warning";
    LogLevel["Error"] = "error";
})(LogLevel || (LogLevel = {}));
const statusIcons = {
    pending: "○",
    success: "✔",
    error: "✖"
};
const statusColors = {
    pending: "blue",
    running: "cyan",
    success: "green",
    error: "red"
};
const deployStatusTexts = {
    pending: "Waiting...",
    running: "Deploying...",
    success: "Published!",
    error: "Failed"
};
const dryRunStatusTexts = {
    pending: "Waiting...",
    running: "Validating...",
    success: "Valid",
    error: "Invalid"
};
const logLevelColors = {
    info: "white",
    warning: "yellow",
    error: "red"
};
function stripAnsi(str) {
    return str.replace(/\u001b\[[0-9;]*m/g, "");
}
export class MissingArgsError extends Error {
    tables;
    constructor(tables) {
        super("Missing required arguments");
        this.tables = tables;
    }
}
export class NoStoresError extends Error {
    tables;
    constructor(message, tables = []) {
        super(message);
        this.tables = tables;
    }
}
function HelpTable({ data }) {
    const { title, fields } = data;
    if (fields.length === 0) {
        return null;
    }
    const nameWidth = Math.max(10, ...fields.map(field => field.name.length)) + 2;
    const typeWidth = 10;
    const requiredWidth = 10;
    const defaultWidth = Math.max(10, ...fields.map(field => field.defaultValue.length)) + 2;
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Newline, null),
        React.createElement(Text, { color: "yellow" },
            title,
            ":"),
        React.createElement(Text, null,
            "  ",
            "Argument".padEnd(nameWidth),
            "Type".padEnd(typeWidth),
            "Required".padEnd(requiredWidth),
            "Default".padEnd(defaultWidth),
            "Description"),
        React.createElement(Text, null,
            "  ",
            "-".repeat(nameWidth + typeWidth + requiredWidth + defaultWidth + 20)),
        fields.map(field => {
            const namePad = " ".repeat(Math.max(0, nameWidth - field.name.length));
            const requiredPad = " ".repeat(field.isMissing ? requiredWidth - 1 : requiredWidth);
            return (React.createElement(Text, { key: field.name },
                "  ",
                React.createElement(Text, { color: field.isMissing ? "red" : undefined }, field.name),
                `${namePad}${field.type.padEnd(typeWidth)}`,
                field.isMissing ? React.createElement(Text, { color: "green" }, "\u2714") : null,
                `${requiredPad}${field.defaultValue.padEnd(defaultWidth)}${field.description}`));
        })));
}
function unwrapZodType(zodValue) {
    const rawDescription = getZodDescription(zodValue);
    const defaultMatch = rawDescription.match(/\s*\(default:\s*(.+?)\)\s*$/i);
    const type = getZodBaseType(unwrapZod(zodValue));
    const schemaDefault = getZodDefaultValue(zodValue);
    let defaultValue = "";
    if (defaultMatch) {
        defaultValue = defaultMatch[1];
    }
    else if (schemaDefault !== undefined) {
        defaultValue = String(schemaDefault);
    }
    const description = defaultMatch ? rawDescription.slice(0, defaultMatch.index) : rawDescription;
    return { type, defaultValue, description };
}
export function buildHelpTableData(storeName, schema, mode, missingFields, dynamicFields, cliOverridableFields) {
    if (!(schema instanceof z.ZodObject)) {
        return null;
    }
    function formatFieldName(key) {
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
    const fields = [];
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
export function buildGlobalHelpTableData(schema, missingArgs, mode) {
    if (missingArgs.length === 0 || !(schema instanceof z.ZodObject)) {
        return null;
    }
    function formatFieldName(key) {
        if (mode === "cli") {
            return `--${kebabCase(key)}`;
        }
        if (mode === "env") {
            return screamingSnakeCase(key);
        }
        return key;
    }
    const fields = [];
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
    const messages = [];
    let triggerRender = null;
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
        return (React.createElement(Box, { flexDirection: "column" }, messages.map((message, i) => (React.createElement(Text, { key: i },
            SPINNER_FRAMES[spinnerFrame],
            " ",
            message)))));
    }
    const inkInstance = render(React.createElement(PreDeployUI, null));
    return {
        log(message) {
            messages.push(message);
            triggerRender?.();
        },
        unmount() {
            inkInstance.unmount();
        }
    };
}
export async function renderHelpTables(tables) {
    if (tables.length === 0) {
        return;
    }
    let resolveRendered;
    const rendered = new Promise(resolve => {
        resolveRendered = resolve;
    });
    function HelpTablesUI() {
        useEffect(() => {
            resolveRendered();
        }, []);
        return (React.createElement(Box, { flexDirection: "column" }, tables.map((table, i) => (React.createElement(HelpTable, { key: i, data: table })))));
    }
    const inkInstance = render(React.createElement(HelpTablesUI, null));
    await rendered;
    inkInstance.unmount();
}
export async function renderApplicationError(error) {
    let resolveRendered;
    const rendered = new Promise(resolve => {
        resolveRendered = resolve;
    });
    function ErrorUI() {
        useEffect(() => {
            resolveRendered();
        }, []);
        if (error instanceof MissingArgsError || error instanceof NoStoresError) {
            return (React.createElement(Box, { flexDirection: "column" },
                React.createElement(Text, null,
                    React.createElement(Text, { color: "red" }, "\u2716"),
                    " ",
                    error.message),
                error.tables.map((table, i) => (React.createElement(HelpTable, { key: i, data: table })))));
        }
        return (React.createElement(Box, null,
            React.createElement(Text, null,
                React.createElement(Text, { color: "red" }, "\u2716"),
                " ",
                error.message)));
    }
    const inkInstance = render(React.createElement(ErrorUI, null));
    await rendered;
    inkInstance.unmount();
}
export function getRecentActivityEntries(storeNames, entries) {
    return storeNames.flatMap(store => entries.filter(entry => entry.store === store).slice(-2));
}
export function createInkLogger(storeNames, isDryRun, isVerbose) {
    const sharedStatuses = {};
    for (const store of storeNames) {
        sharedStatuses[store] = StoreStatus.Pending;
    }
    const sharedEntries = [];
    let sharedHelpTables = [];
    let triggerRender = null;
    let resolveReady;
    let notifyAfterRender = null;
    const ready = new Promise(resolve => {
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
        const summaryParts = [];
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
        return (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { bold: true, color: "cyan" }, "Web Extension Deployment"),
            React.createElement(Newline, null),
            storeNames.map(store => {
                const status = sharedStatuses[store] ?? StoreStatus.Pending;
                const icon = status === StoreStatus.Running
                    ? SPINNER_FRAMES[spinnerFrame]
                    : (statusIcons[status] ?? "?");
                const statusText = isDryRun ? dryRunStatusTexts[status] : deployStatusTexts[status];
                return (React.createElement(Text, { key: store },
                    React.createElement(Text, { color: statusColors[status] }, icon),
                    " ",
                    getStoreDisplayName(store),
                    ": ",
                    statusText));
            }),
            React.createElement(Newline, null),
            React.createElement(Box, null,
                React.createElement(Text, null, "["),
                React.createElement(Text, { color: "green" }, "█".repeat(successFilled)),
                React.createElement(Text, { color: "red" }, "█".repeat(errorFilled)),
                React.createElement(Text, { color: "gray" }, "░".repeat(Math.max(0, barWidth - successFilled - errorFilled))),
                React.createElement(Text, null,
                    "] ",
                    label)),
            React.createElement(Box, null, summaryParts.map((part, i) => (React.createElement(React.Fragment, { key: part.color },
                i > 0 && React.createElement(Text, null, "  "),
                React.createElement(Text, { color: part.color }, part.text))))),
            activityEntries.length > 0 && (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Text, { bold: true, color: "gray" }, "Recent Activity:"),
                getRecentActivityEntries(storeNames, activityEntries).map((entry, i) => (React.createElement(Text, { key: i, color: logLevelColors[entry.level] },
                    "[",
                    entry.timestamp.toLocaleTimeString(),
                    "] ",
                    entry.store === "System" ? "System" : getStoreDisplayName(entry.store),
                    ": ",
                    stripAnsi(entry.message)))))),
            allComplete && sharedHelpTables.length > 0 && (React.createElement(Box, { flexDirection: "column", marginTop: 1 }, sharedHelpTables.map((tableData, i) => (React.createElement(HelpTable, { key: i, data: tableData })))))));
    }
    const inkInstance = render(React.createElement(DeployUI, null));
    function addLogEntry(entry, overrideStatus) {
        sharedEntries.push(entry);
        if (entry.store !== "System") {
            if (overrideStatus !== undefined) {
                sharedStatuses[entry.store] = overrideStatus;
            }
            else if (sharedStatuses[entry.store] === StoreStatus.Pending) {
                sharedStatuses[entry.store] = StoreStatus.Running;
            }
        }
        triggerRender?.();
    }
    const logger = {
        info(store, message) {
            addLogEntry({
                store,
                level: LogLevel.Info,
                message,
                timestamp: new Date()
            });
        },
        warning(store, message) {
            addLogEntry({
                store,
                level: LogLevel.Warning,
                message: `Warning: ${message}`,
                timestamp: new Date()
            });
        },
        error(store, message) {
            addLogEntry({
                store,
                level: LogLevel.Error,
                message,
                timestamp: new Date()
            }, StoreStatus.Error);
        }
    };
    const monitor = {
        updateStore(store, status, message) {
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
        setZipPath(store, zipPath) {
            addLogEntry({
                store,
                level: LogLevel.Info,
                message: `ZIP: ${zipPath}`,
                timestamp: new Date()
            });
        },
        setHelpTables(tables) {
            sharedHelpTables = tables;
            triggerRender?.();
        }
    };
    return {
        ready,
        logger,
        monitor,
        forStore: (store) => ({
            info: message => logger.info(store, message),
            warning: message => logger.warning(store, message),
            error: message => logger.error(store, message),
            async countdown(seconds, getMessage) {
                const entry = {
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
        }),
        waitForRender() {
            return new Promise(resolve => {
                notifyAfterRender = resolve;
                triggerRender?.();
            });
        },
        unmount() {
            inkInstance.unmount();
        }
    };
}
