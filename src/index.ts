#!/usr/bin/env node
import { z } from "zod";
import { capitalCase } from "./case-conversion.js";
import { argv, getCookies, getJsonStoresFromCli, readCookiesFromEnv, type CliLog } from "./cli.js";
import { deployStore } from "./deploy-store.js";
import { red } from "./logging.js";
import { isSupportedStore, isSupportedGetCookies, getStore } from "./stores/registry.js";
import type { CookieRefreshCallback, StoreLogger, StoreOptionsBase } from "./types.js";

async function initCli() {
  if (argv.getCookies) {
    const getCookiesArg = z.array(z.string()).parse(argv.getCookies);
    const validCookies = getCookiesArg.filter(isSupportedGetCookies);
    await getCookies(validCookies);
    process.exit();
  }

  const command = z.string().parse(argv._[0]);
  const publishOnlyArg = z.array(z.string()).optional().parse(argv.publishOnly) ?? [];
  const validStores = publishOnlyArg.filter(isSupportedStore);
  if (validStores.length > 0 && command !== "env") {
    throw new Error(red("You must use the env command to use --publish-only"));
  }

  const pendingLogs: Array<{ level: "info" | "error"; store: string; message: string }> = [];
  const collectLog: CliLog = (level, store, message) =>
    pendingLogs.push({
      level,
      store,
      message
    });

  const storeJsons = await getJsonStoresFromCli(collectLog);
  const storeEntries = Object.entries(storeJsons).filter(
    (entry): entry is [string, StoreOptionsBase] => isSupportedStore(entry[0]) && entry[1] !== undefined
  );

  if (storeEntries.length === 0) {
    throw new Error(red("No stores to deploy to"));
  }

  const selectedStoreNames = storeEntries.map(([store]) => store);
  const { createInkLogger } = await import("./ink-logger.js");
  const inkLogger = createInkLogger(selectedStoreNames);

  for (const { level, store, message } of pendingLogs) {
    inkLogger.logger[level](store, message);
  }

  const autoFetchCookies = z.boolean().optional().parse(argv.autoFetchCookies);
  const dryRun = z.boolean().optional().parse(argv.dryRun);
  const verbose = z.boolean().optional().parse(argv.verbose);

  const results = await Promise.allSettled(
    storeEntries.map(async ([store, json]) => {
      if (json.zip) {
        inkLogger.monitor.setZipPath(store, json.zip);
      }
      try {
        inkLogger.logger.info(store, dryRun ? "Validating inputs" : "Starting deployment");
        const storeLogger = {
          info: msg => inkLogger.logger.info(capitalCase(store), msg),
          warning: msg => inkLogger.logger.warning(capitalCase(store), msg),
          error: msg => inkLogger.logger.error(capitalCase(store), msg)
        } satisfies StoreLogger;

        let onCookieExpired: CookieRefreshCallback | undefined;
        const storeDef = autoFetchCookies ? getStore(store) : undefined;
        if (storeDef?.cookieFields) {
          onCookieExpired = async () => {
            await getCookies([store]);
            return readCookiesFromEnv(store, storeDef.cookieFields);
          };
        }

        const success = await deployStore(json, store, storeLogger, onCookieExpired, dryRun, verbose);
        if (!success) {
          inkLogger.logger.error(store, "Deployment failed");
          return false;
        }
        inkLogger.logger.info(store, "Published!");
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        inkLogger.logger.error(store, errorMessage);
        return false;
      }
    })
  );

  const successes = results.filter(r => r.status === "fulfilled" && r.value === true).length;
  const failures = results.length - successes;

  storeEntries.forEach(([store], i) => {
    const r = results[i];
    if (r.status === "fulfilled" && r.value === true) {
      inkLogger.monitor.updateStore(store, "success");
    }
  });

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
