#!/usr/bin/env node
import { z } from "zod";
import { createCookieRefreshCallback, getJsonStoresFromCli, parser } from "./cli.js";
import { deployStore } from "./deploy-store.js";
import { red } from "./logging.js";
import { createInkLogger } from "./ink-logger.js";
import { getStore, isSupportedStore } from "./stores/registry.js";

async function runStoreDeploy(
  store: string,
  json: Record<string, unknown>,
  inkLogger: ReturnType<typeof createInkLogger>,
  dryRun?: boolean,
  verbose?: boolean
) {
  const zip = z.string().safeParse(json["zip"]);
  if (zip.success) {
    inkLogger.monitor.setZipPath(store, zip.data);
  }

  inkLogger.logger.info(store, dryRun ? "Validating inputs" : "Starting deployment");

  const storeLogger = inkLogger.forStore(store);
  const storeDef = getStore(store);
  const onCookieExpired = storeDef?.cookieFields
    ? createCookieRefreshCallback(store, storeDef.cookieFields)
    : undefined;

  return deployStore(json, store, storeLogger, onCookieExpired, dryRun, verbose);
}

async function initCli() {
  const argv = parser.parseSync();
  const storeJsons = await getJsonStoresFromCli(argv);

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
  const dryRun = z.boolean().safeParse(argv.dryRun).data;
  const verbose = z.boolean().safeParse(argv.verbose).data;

  const results = await Promise.allSettled(
    storeEntries.map(([store, json]) => runStoreDeploy(store, json, inkLogger, dryRun, verbose))
  );

  let successes = 0;
  let failures = 0;

  for (let i = 0; i < storeEntries.length; i++) {
    const [store] = storeEntries[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      inkLogger.logger.info(store, "Published!");
      inkLogger.monitor.updateStore(store, "success");
      successes++;
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      inkLogger.logger.error(store, message);
      inkLogger.monitor.updateStore(store, "error");
      failures++;
    }
  }

  inkLogger.logger.info("System", `Deployments complete! ${successes} succeeded, ${failures} failed`);
  inkLogger.unmount();

  if (failures > 0) {
    throw new Error(red(`${failures} deployment(s) failed`));
  }
}

initCli().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
