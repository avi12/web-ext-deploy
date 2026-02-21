#!/usr/bin/env node
import { createCookieRefreshCallback, getJsonStoresFromCli, parser } from "./cli.js";
import { deployStore } from "./deploy-store.js";
import { createInkLogger, renderFatalError } from "./ink-logger.js";
import { red } from "./logging.js";
import { getStore, isSupportedStore } from "./stores/registry.js";
import { toError } from "./utils.js";
import { z } from "zod";

async function runStoreDeploy (
  store: string,
  json: Record<string, unknown>,
  inkLogger: ReturnType<typeof createInkLogger>,
  isDryRun?: boolean,
  isVerbose?: boolean
) {
  inkLogger.logger.info(store, isDryRun ? "Validating inputs" : "Starting deployment");

  const storeDef = getStore(store);
  const onCookieExpired = storeDef?.cookieFields
    ? createCookieRefreshCallback(store, storeDef.cookieFields)
    : undefined;

  return deployStore(json, store, {
    logger: inkLogger.forStore(store),
    onCookieExpired,
    isDryRun,
    isVerbose,
    setStatus: (status, message) => inkLogger.monitor.updateStore(store, status, message),
    setZipPath: zipPath => inkLogger.monitor.setZipPath(store, zipPath)
  });
}

async function initCli () {
  const argv = parser.parseSync();
  const preDeployLogs: string[] = [];
  const storeJsons = await getJsonStoresFromCli(argv, msg => preDeployLogs.push(msg));

  const storeEntries: [string, Record<string, unknown>][] = [];
  for (const [store, json] of Object.entries(storeJsons)) {
    if (isSupportedStore(store) && json !== undefined) {
      storeEntries.push([store, json]);
    }
  }

  if (storeEntries.length === 0) {
    throw new Error(red("No stores to deploy to"));
  }

  const inkLogger = createInkLogger(storeEntries.map(([store]) => store));
  for (const msg of preDeployLogs) {
    inkLogger.logger.info("System", msg);
  }
  const isDryRun = z.boolean().safeParse(argv.dryRun).data;
  const isVerbose = z.boolean().safeParse(argv.verbose).data;

  const results = await Promise.allSettled(
    storeEntries.map(([store, json]) => runStoreDeploy(store, json, inkLogger, isDryRun, isVerbose))
  );

  const failures: string[] = [];
  for (const [idx, result] of results.entries()) {
    const [store] = storeEntries[idx];
    if (result.status === "fulfilled") {
      inkLogger.logger.info(store, "Published!");
      inkLogger.monitor.updateStore(store, "success");
    } else {
      inkLogger.logger.error(store, toError(result.reason).message);
      inkLogger.monitor.updateStore(store, "error");
      failures.push(store);
    }
  }

  const successes = results.length - failures.length;
  inkLogger.logger.info("System", `Deployments complete! ${successes} succeeded, ${failures.length} failed`);
  inkLogger.unmount();

  if (failures.length > 0) {
    throw new Error(red(`${failures.length} deployment(s) failed`));
  }
}

initCli().catch((err: Error) => {
  renderFatalError(err.message);
  process.exitCode = 1;
});
