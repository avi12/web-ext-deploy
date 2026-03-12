import { StoreName } from "../src/types.js";
import { type LogEntry } from "../src/ui/ink-logger.js";
import { describe, expect, it } from "vitest";

function makeEntry(store: StoreName, level: LogEntry["level"], message: string): LogEntry {
  return {
    store, level, message, timestamp: new Date()
  };
}

describe("per-store status display", () => {
  it("latestEntry is last entry in store's entries", () => {
    const entries: LogEntry[] = [
      makeEntry(StoreName.Chrome, "info", "Uploading zip"),
      makeEntry(StoreName.Chrome, "info", "Verifying upload"),
      makeEntry(StoreName.Firefox, "info", "Uploading zip")
    ];

    const chromeEntries = entries.filter(entry => entry.store === StoreName.Chrome);
    const latestEntry = chromeEntries[chromeEntries.length - 1];
    expect(latestEntry.message).toBe("Verifying upload");
  });

  it("firstErrorEntry is the first error-level entry in store's entries", () => {
    const entries: LogEntry[] = [
      makeEntry(StoreName.Chrome, "info", "Uploading zip"),
      makeEntry(StoreName.Chrome, "error", "Upload failed: 400 Bad Request"),
      makeEntry(StoreName.Chrome, "error", "Second error line")
    ];

    const chromeEntries = entries.filter(entry => entry.store === StoreName.Chrome);
    const firstErrorEntry = chromeEntries.find(entry => entry.level === "error");
    expect(firstErrorEntry?.message).toBe("Upload failed: 400 Bad Request");
  });
});
