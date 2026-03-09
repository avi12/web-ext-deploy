import { StoreName } from "../src/types.js";
import { type LogEntry, getRecentActivityEntries } from "../src/ui/ink-logger.js";
import { describe, expect, it } from "vitest";

function makeEntry(store: StoreName, message: string): LogEntry {
  return {
    store, level: "info", message, timestamp: new Date()
  };
}

describe("getRecentActivityEntries", () => {
  const stores = [StoreName.Chrome, StoreName.Firefox, StoreName.Opera];

  it("shows last 2 entries per store regardless of overall message order", () => {
    const entries: LogEntry[] = [
      makeEntry(StoreName.Chrome, "Uploading zip"),
      makeEntry(StoreName.Firefox, "Uploading zip"),
      makeEntry(StoreName.Opera, "Uploading zip"),
      makeEntry(StoreName.Chrome, "Warning: Retrying in 60s"), // chrome stuck here
      makeEntry(StoreName.Firefox, "Verifying upload"),
      makeEntry(StoreName.Opera, "Verifying upload"),
      makeEntry(StoreName.Firefox, "Creating new version"),
      makeEntry(StoreName.Opera, "Canceling unsubmitted version"),
      makeEntry(StoreName.Firefox, "Successfully published"),
      makeEntry(StoreName.Opera, "Uploading zip"),
      makeEntry(StoreName.Opera, "Verifying upload"),
      makeEntry(StoreName.Opera, "Successfully published")
    ];

    const result = getRecentActivityEntries(stores, entries);

    expect(result.map(entry => ({ store: entry.store, message: entry.message }))).toEqual([
      { store: StoreName.Chrome, message: "Uploading zip" },
      { store: StoreName.Chrome, message: "Warning: Retrying in 60s" },
      { store: StoreName.Firefox, message: "Creating new version" },
      { store: StoreName.Firefox, message: "Successfully published" },
      { store: StoreName.Opera, message: "Verifying upload" },
      { store: StoreName.Opera, message: "Successfully published" }
    ]);
  });

  it("excludes stores with no entries", () => {
    const entries: LogEntry[] = [
      makeEntry(StoreName.Chrome, "Uploading zip")
    ];

    const result = getRecentActivityEntries(stores, entries);

    expect(result).toHaveLength(1);
    expect(result[0].store).toBe(StoreName.Chrome);
  });

  it("shows only 1 entry when a store has just 1", () => {
    const entries: LogEntry[] = [
      makeEntry(StoreName.Chrome, "Only message"),
      makeEntry(StoreName.Firefox, "First"),
      makeEntry(StoreName.Firefox, "Second"),
      makeEntry(StoreName.Firefox, "Third")
    ];

    const result = getRecentActivityEntries(stores, entries);

    const chromeEntries = result.filter(entry => entry.store === StoreName.Chrome);
    const firefoxEntries = result.filter(entry => entry.store === StoreName.Firefox);
    expect(chromeEntries).toHaveLength(1);
    expect(firefoxEntries).toHaveLength(2);
    expect(firefoxEntries.map(entry => entry.message)).toEqual(["Second", "Third"]);
  });

  it("returns entries in store-registry order, not message order", () => {
    const entries: LogEntry[] = [
      makeEntry(StoreName.Opera, "Opera message"),
      makeEntry(StoreName.Chrome, "Chrome message")
    ];

    const result = getRecentActivityEntries(stores, entries);

    expect(result[0].store).toBe(StoreName.Chrome);
    expect(result[1].store).toBe(StoreName.Opera);
  });

  it("returns empty array when there are no entries", () => {
    expect(getRecentActivityEntries(stores, [])).toEqual([]);
  });
});
