import { createCookieRefreshCallback, getJsonStoresFromCli } from "./cli.js";
import { deployStore, StoreValidationError } from "./deploy-single-store.js";
import { getStore, isSupportedStore } from "./stores/registry.js";
import { StoreStatus } from "./types.js";
import { createInkLogger, createPreDeployUI, type HelpTableData } from "./ui/ink-logger.js";
import { toError } from "./utils/retry.js";
import type { Arguments } from "yargs";
import { z } from "zod";

async function runStoreDeploy(
  store: string,
  json: Record<string, unknown>,
  inkLogger: ReturnType<typeof createInkLogger>,
  isDryRun?: boolean,
  isVerbose?: boolean,
  isAutoFetchCookies?: boolean,
  mode?: "cli" | "env"
) {
  inkLogger.logger.info(store, isDryRun ? "Validating inputs" : "Starting deployment");

  const storeDef = getStore(store);
  const onCookieExpired = isAutoFetchCookies && storeDef?.cookieFields
    ? createCookieRefreshCallback(store, storeDef.cookieFields)
    : undefined;

  return deployStore(json, store, {
    logger: inkLogger.forStore(store),
    onCookieExpired,
    isDryRun,
    isVerbose,
    mode,
    setStatus: (status, message) => inkLogger.monitor.updateStore(store, status, message),
    setZipPath: zipPath => inkLogger.monitor.setZipPath(store, zipPath)
  });
}

export async function runDeploy(argv: Arguments) {
  const preDeployLogs: string[] = [];
  const preDeployUI = createPreDeployUI();
  let storeJsons;
  try {
    storeJsons = await getJsonStoresFromCli(argv, message => {
      preDeployUI.log(message);
      preDeployLogs.push(message);
    });
  } catch (error) {
    preDeployUI.unmount();
    throw error;
  }
  preDeployUI.unmount();

  const storeEntries: [string, Record<string, unknown>][] = [];
  for (const [store, json] of Object.entries(storeJsons)) {
    if (isSupportedStore(store) && json !== undefined) {
      storeEntries.push([store, json]);
    }
  }

  if (storeEntries.length === 0) {
    throw new Error("No stores to deploy to");
  }

  const command = z.string().safeParse(argv._[0]).data;
  const mode = command === "cli" || command === "env" ? command : undefined;
  const isDryRun = z.boolean().safeParse(argv.dryRun).data;
  const isVerbose = z.boolean().safeParse(argv.verbose).data;
  const inkLogger = createInkLogger(storeEntries.map(([store]) => store), isDryRun, isVerbose);
  await inkLogger.ready;
  for (const message of preDeployLogs) {
    inkLogger.logger.info("System", message);
  }
  const isAutoFetchCookies = z.boolean().safeParse(argv.autoFetchCookies).data;

  const results = await Promise.allSettled(
    storeEntries.map(([store, json]) => runStoreDeploy(store, json, inkLogger, isDryRun, isVerbose, isAutoFetchCookies, mode))
  );

  const failures: string[] = [];
  const helpTables: HelpTableData[] = [];
  for (const [index, result] of results.entries()) {
    const [store] = storeEntries[index];
    if (result.status === "fulfilled") {
      inkLogger.logger.info(store, isDryRun ? "Validation passed" : "Published!");
      inkLogger.monitor.updateStore(store, StoreStatus.Success);
    } else {
      const error = toError(result.reason);
      for (const line of error.message.split("\n").filter(line => line.trim())) {
        inkLogger.logger.error(store, line);
      }
      inkLogger.monitor.updateStore(store, StoreStatus.Error);
      if (error instanceof StoreValidationError) {
        helpTables.push(...error.helpTables);
      }
      failures.push(store);
    }
  }

  const successes = results.length - failures.length;
  inkLogger.logger.info("System", `Deployments complete! ${successes} succeeded, ${failures.length} failed`);
  inkLogger.monitor.setHelpTables(helpTables);
  await inkLogger.waitForRender();
  inkLogger.unmount();

  if (failures.length > 0) {
    const isPlural = failures.length > 1;
    throw new Error(`${failures.length} deployment${isPlural ? "s" : ""} failed`);
  }
}
