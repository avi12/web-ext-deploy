import { describe, expect, it } from "vitest";

import { StoreName } from "@/types.js";
import { type LogEntry } from "@/ui/ink-logger.js";

function makeEntry({ store, level, message }: { store: StoreName; level: LogEntry["level"]; message: string }) {
  return {
    store,
    level,
    message,
    timestamp: new Date()
  };
}

describe("per-store status display", () => {
  it("latestEntry is last entry in store's entries", () => {
    const entries: LogEntry[] = [
      makeEntry({
        store: StoreName.CHROME,
        level: "info",
        message: "Uploading zip"
      }),
      makeEntry({
        store: StoreName.CHROME,
        level: "info",
        message: "Verifying upload"
      }),
      makeEntry({
        store: StoreName.FIREFOX,
        level: "info",
        message: "Uploading zip"
      })
    ];

    const chromeEntries = entries.filter(entry => entry.store === StoreName.CHROME);
    const latestEntry = chromeEntries[chromeEntries.length - 1];
    expect(latestEntry.message).toBe("Verifying upload");
  });

  it("firstErrorEntry is the first error-level entry in store's entries", () => {
    const entries: LogEntry[] = [
      makeEntry({
        store: StoreName.CHROME,
        level: "info",
        message: "Uploading zip"
      }),
      makeEntry({
        store: StoreName.CHROME,
        level: "error",
        message: "Upload failed: 400 Bad Request"
      }),
      makeEntry({
        store: StoreName.CHROME,
        level: "error",
        message: "Second error line"
      })
    ];

    const chromeEntries = entries.filter(entry => entry.store === StoreName.CHROME);
    const firstErrorEntry = chromeEntries.find(entry => entry.level === "error");
    expect(firstErrorEntry?.message).toBe("Upload failed: 400 Bad Request");
  });
});
