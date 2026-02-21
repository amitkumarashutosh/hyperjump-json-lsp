import { addUriSchemePlugin } from "@hyperjump/browser";
import { addSchema } from "@hyperjump/json-schema/draft-07";
import { registerSchemaAssociation } from "./schemaResolver.js";
import { RawSchema } from "./schemaWalker.js";

// Teach Hyperjump how to fetch https:// URIs and handle application/json
addUriSchemePlugin("https", {
  retrieve: async (uri: string) => {
    const response = await fetch(uri, {
      headers: {
        Accept: "application/schema+json, application/json",
        "User-Agent": "hyperjump-json-lsp/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": "application/schema+json",
      },
    });
  },
});

addUriSchemePlugin("http", {
  retrieve: async (uri: string) => {
    const response = await fetch(uri, {
      headers: {
        Accept: "application/schema+json, application/json",
        "User-Agent": "hyperjump-json-lsp/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": "application/schema+json",
      },
    });
  },
});

// Meta-schema URIs that should never be fetched as document schemas
const META_SCHEMA_URIS = new Set([
  "http://json-schema.org/draft-04/schema#",
  "http://json-schema.org/draft-04/schema",
  "http://json-schema.org/draft-06/schema#",
  "http://json-schema.org/draft-06/schema",
  "http://json-schema.org/draft-07/schema#",
  "http://json-schema.org/draft-07/schema",
  "https://json-schema.org/draft/2019-09/schema",
  "https://json-schema.org/draft/2020-12/schema",
]);

// Cache: URI → resolved schema
const schemaCache = new Map<string, RawSchema>();

// Pending: URI → Promise (to avoid duplicate fetches)
const pendingFetches = new Map<string, Promise<RawSchema | null>>();

// Failed URIs: don't retry
const failedUris = new Set<string>();

export async function fetchSchema(uri: string): Promise<RawSchema | null> {
  if (schemaCache.has(uri)) return schemaCache.get(uri)!;
  if (failedUris.has(uri)) return null;
  if (pendingFetches.has(uri)) return pendingFetches.get(uri)!;

  const promise = doFetch(uri).then((schema) => {
    pendingFetches.delete(uri);

    if (!schema) {
      failedUris.add(uri);
      return null;
    }

    schemaCache.set(uri, schema);

    try {
      addSchema(schema as any, uri);
    } catch {
      // Already registered — ignore
    }

    registerSchemaAssociation({
      uri,
      schema,
      pattern: "",
    });

    console.error(`[schemaFetcher] loaded: ${uri}`);
    return schema;
  });

  pendingFetches.set(uri, promise);
  return promise;
}

export function isSchemaLoaded(uri: string): boolean {
  return schemaCache.has(uri);
}

export function getCachedSchema(uri: string): RawSchema | undefined {
  return schemaCache.get(uri);
}

export function clearSchemaCache(): void {
  schemaCache.clear();
  pendingFetches.clear();
  failedUris.clear();
}

async function doFetch(uri: string): Promise<RawSchema | null> {
  if (!uri.startsWith("http://") && !uri.startsWith("https://")) {
    return null;
  }

  // Never fetch meta-schema URIs — they are draft identifiers, not document schemas
  if (META_SCHEMA_URIS.has(uri)) {
    console.error(`[schemaFetcher] skipping meta-schema URI: ${uri}`);
    return null;
  }

  try {
    console.error(`[schemaFetcher] fetching: ${uri}`);

    const response = await fetch(uri, {
      headers: {
        Accept: "application/schema+json, application/json",
        "User-Agent": "hyperjump-json-lsp/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[schemaFetcher] HTTP ${response.status} for ${uri}`);
      return null;
    }

    const schema = (await response.json()) as RawSchema;
    return schema;
  } catch (err) {
    console.error(`[schemaFetcher] failed to fetch ${uri}:`, err);
    return null;
  }
}
