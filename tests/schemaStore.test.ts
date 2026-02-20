import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findCatalogEntry,
  getSchemaStoreUri,
  loadSchemaStoreCatalog,
} from "../src/json/schemaStore.js";

// Mock the catalog response
const mockCatalog = {
  schemas: [
    {
      name: "TypeScript Config",
      fileMatch: ["tsconfig.json", "tsconfig.*.json"],
      url: "https://json.schemastore.org/tsconfig.json",
    },
    {
      name: "Package JSON",
      fileMatch: ["package.json"],
      url: "https://json.schemastore.org/package.json",
    },
    {
      name: "ESLint",
      fileMatch: [".eslintrc.json", ".eslintrc"],
      url: "https://json.schemastore.org/eslintrc.json",
    },
  ],
};

beforeEach(async () => {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => mockCatalog,
  }));

  // Reset catalog state by re-importing with cleared state
  // We call loadSchemaStoreCatalog which is idempotent after first load
});

describe("loadSchemaStoreCatalog", () => {
  it("loads catalog entries", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => mockCatalog,
    }));

    await loadSchemaStoreCatalog();
    const entry = findCatalogEntry("file:///project/tsconfig.json");
    expect(entry).toBeDefined();
    expect(entry?.name).toBe("TypeScript Config");
  });
});

describe("findCatalogEntry", () => {
  it("finds entry by exact filename", () => {
    const entry = findCatalogEntry("file:///project/package.json");
    expect(entry?.name).toBe("Package JSON");
  });

  it("finds entry by glob pattern", () => {
    const entry = findCatalogEntry("file:///project/tsconfig.app.json");
    expect(entry?.name).toBe("TypeScript Config");
  });

  it("returns undefined for unknown file", () => {
    const entry = findCatalogEntry("file:///project/unknown.json");
    expect(entry).toBeUndefined();
  });
});

describe("getSchemaStoreUri", () => {
  it("returns schema URI for known file", () => {
    const uri = getSchemaStoreUri("file:///project/package.json");
    expect(uri).toBe("https://json.schemastore.org/package.json");
  });

  it("returns undefined for unknown file", () => {
    const uri = getSchemaStoreUri("file:///project/random.json");
    expect(uri).toBeUndefined();
  });
});
