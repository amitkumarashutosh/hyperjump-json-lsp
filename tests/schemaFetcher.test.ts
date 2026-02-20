import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  fetchSchema,
  isSchemaLoaded,
  getCachedSchema,
  clearSchemaCache,
} from "../src/json/schemaFetcher.js";

beforeEach(() => {
  clearSchemaCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("schemaFetcher", () => {
  it("returns null for non-http URIs", async () => {
    const result = await fetchSchema("file:///local/schema.json");
    expect(result).toBeNull();
  });

  it("returns null for failed fetches", async () => {
    // Mock fetch to fail
    vi.stubGlobal("fetch", async () => {
      throw new Error("Network error");
    });

    const result = await fetchSchema("https://example.com/bad.json");
    expect(result).toBeNull();
  });

  it("caches successful fetches", async () => {
    const mockSchema = { type: "object", properties: { name: { type: "string" } } };

    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => mockSchema,
    }));

    const result = await fetchSchema("https://example.com/schema.json");
    expect(result).toEqual(mockSchema);
    expect(isSchemaLoaded("https://example.com/schema.json")).toBe(true);
    expect(getCachedSchema("https://example.com/schema.json")).toEqual(mockSchema);
  });

  it("does not fetch the same URI twice", async () => {
    const mockSchema = { type: "object" };
    let fetchCount = 0;

    vi.stubGlobal("fetch", async () => {
      fetchCount++;
      return { ok: true, json: async () => mockSchema };
    });

    await fetchSchema("https://example.com/schema.json");
    await fetchSchema("https://example.com/schema.json");

    expect(fetchCount).toBe(1);
  });

  it("does not retry failed URIs", async () => {
    let fetchCount = 0;

    vi.stubGlobal("fetch", async () => {
      fetchCount++;
      throw new Error("fail");
    });

    await fetchSchema("https://example.com/bad.json");
    await fetchSchema("https://example.com/bad.json");

    expect(fetchCount).toBe(1);
  });

  it("returns null for http 404", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 404,
    }));

    const result = await fetchSchema("https://example.com/missing.json");
    expect(result).toBeNull();
  });
});