import { fetchSchema } from "./schemaFetcher.js";
import { registerSchemaAssociation } from "./schemaResolver.js";

const CATALOG_URI = "https://www.schemastore.org/api/json/catalog.json";

export interface SchemaStoreCatalogEntry {
  name: string;
  description?: string;
  fileMatch?: string[];
  url: string;
}

export interface SchemaStoreCatalog {
  schemas: SchemaStoreCatalogEntry[];
}

// In-memory catalog
let catalog: SchemaStoreCatalogEntry[] = [];
let catalogLoaded = false;

/**
 * Fetch the SchemaStore catalog and register all entries
 * that have fileMatch patterns.
 *
 * This is called once at server startup.
 * It does NOT fetch individual schemas — those are fetched
 * lazily when a matching document is opened.
 */
export async function loadSchemaStoreCatalog(): Promise<void> {
  if (catalogLoaded) return;

  try {
    console.error("[schemaStore] fetching catalog...");

    const response = await fetch(CATALOG_URI, {
      headers: {
        Accept: "application/json",
        "User-Agent": "hyperjump-json-lsp/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.error(`[schemaStore] catalog fetch failed: HTTP ${response.status}`);
      return;
    }

    const data = (await response.json()) as SchemaStoreCatalog;
    catalog = data.schemas ?? [];
    catalogLoaded = true;

    console.error(`[schemaStore] catalog loaded: ${catalog.length} schemas`);

    // Register glob patterns for all entries with fileMatch
    // We do NOT fetch schemas here — only register the association
    // so the resolver knows which URI to fetch when a file is opened
    for (const entry of catalog) {
      if (!entry.fileMatch || entry.fileMatch.length === 0) continue;

      for (const pattern of entry.fileMatch) {
        // Skip patterns with ! (negation) — too complex for our matcher
        if (pattern.startsWith("!")) continue;

        // Register a lazy association — schema will be fetched on demand
        registerLazyAssociation(pattern, entry.url, entry.name);
      }
    }
  } catch (err) {
    console.error("[schemaStore] failed to load catalog:", err);
  }
}

/**
 * Find the best matching catalog entry for a given document URI.
 */
export function findCatalogEntry(
  documentUri: string,
): SchemaStoreCatalogEntry | undefined {
  const filename = documentUri.split("/").pop() ?? "";

  for (const entry of catalog) {
    if (!entry.fileMatch) continue;

    for (const pattern of entry.fileMatch) {
      if (pattern.startsWith("!")) continue;
      if (matchesFilePattern(filename, pattern)) {
        return entry;
      }
    }
  }

  return undefined;
}

/**
 * Get the schema URI for a document from SchemaStore.
 * Returns undefined if no match found.
 */
export function getSchemaStoreUri(documentUri: string): string | undefined {
  const entry = findCatalogEntry(documentUri);
  return entry?.url;
}

// ── Lazy Association ──────────────────────────────────────────────────────────

interface LazyAssociation {
  pattern: string;
  uri: string;
  name: string;
}

const lazyAssociations: LazyAssociation[] = [];

function registerLazyAssociation(
  pattern: string,
  uri: string,
  name: string,
): void {
  lazyAssociations.push({ pattern, uri, name });
}

/**
 * For a given document URI, check if there's a lazy association
 * and fetch+register the schema if needed.
 */
export async function resolveSchemaStoreSchema(
  documentUri: string,
): Promise<{ uri: string } | null> {
  const filename = documentUri.split("/").pop() ?? "";

  for (const assoc of lazyAssociations) {
    if (matchesFilePattern(filename, assoc.pattern)) {
      console.error(
        `[schemaStore] matched "${assoc.name}" for ${filename}`,
      );

      // Fetch the schema — this registers it with the resolver
      const schema = await fetchSchema(assoc.uri);
      if (schema) {
        return { uri: assoc.uri };
      }
    }
  }

  return null;
}

// ── Pattern Matching ──────────────────────────────────────────────────────────

/**
 * Match a filename against a SchemaStore fileMatch pattern.
 * Supports: exact match, * glob, prefix/suffix patterns.
 */
function matchesFilePattern(filename: string, pattern: string): boolean {
  // Exact match
  if (filename === pattern) return true;

  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "(.+)")
    .replace(/\*/g, "([^/]*)");

  try {
    const regex = new RegExp(`^${escaped}$`);
    return regex.test(filename);
  } catch {
    return false;
  }
}