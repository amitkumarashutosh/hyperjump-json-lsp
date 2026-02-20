import { TextDocument } from "vscode-languageserver-textdocument";
import { JSONDocument } from "./jsonDocument.js";
import { RawSchema } from "./schemaWalker.js";
import { fetchSchema, getCachedSchema } from "./schemaFetcher.js";

export interface SchemaAssociation {
  pattern: string;
  uri: string;
  schema: RawSchema;
}

export interface ResolvedSchema {
  schema: RawSchema;
  uri: string;
}

const associations: SchemaAssociation[] = [];
const schemasByUri = new Map<string, RawSchema>();

export function registerSchemaAssociation(
  association: SchemaAssociation,
): void {
  schemasByUri.set(association.uri, association.schema);
  if (association.pattern) {
    associations.push(association);
  }
}

/**
 * Resolve the schema for a document synchronously.
 * If the schema needs to be fetched, triggers a background fetch
 * and returns null — the caller re-validates once loaded.
 */
export function resolveSchema(
  document: TextDocument,
  jsonDoc: JSONDocument,
): ResolvedSchema | null {
  // ── Strategy 1: $schema inline ───────────────────────────────────────────
  const inlineUri = extractInlineSchemaUri(jsonDoc);

  if (inlineUri) {
    // Check local registry first
    const local = schemasByUri.get(inlineUri);
    if (local) return { schema: local, uri: inlineUri };

    // Check fetcher cache
    const cached = getCachedSchema(inlineUri);
    if (cached) return { schema: cached, uri: inlineUri };

    // Not loaded yet — trigger background fetch
    fetchSchema(inlineUri).then((schema) => {
      if (schema) {
        console.error(`[resolver] schema loaded: ${inlineUri}`);
      }
    });

    return null;
  }

  // ── Strategy 2: filename glob pattern ────────────────────────────────────
  for (const assoc of associations) {
    if (matchesPattern(document.uri, assoc.pattern)) {
      return { schema: assoc.schema, uri: assoc.uri };
    }
  }

  return null;
}

function extractInlineSchemaUri(jsonDoc: JSONDocument): string | undefined {
  const root = jsonDoc.root;
  if (!root || root.type !== "object") return undefined;

  for (const prop of root.children ?? []) {
    const keyNode = prop.children?.[0];
    const valueNode = prop.children?.[1];

    if (
      keyNode?.value === "$schema" &&
      valueNode?.type === "string" &&
      typeof valueNode.value === "string"
    ) {
      return valueNode.value;
    }
  }

  return undefined;
}

function matchesPattern(uri: string, pattern: string): boolean {
  if (!pattern) return false;

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "(.+)")
    .replace(/\*/g, "([^/]+)");

  const regex = new RegExp(`${escaped}$`);
  const filename = uri.split("/").pop() ?? "";
  return regex.test(uri) || regex.test(filename);
}