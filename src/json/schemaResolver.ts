import { TextDocument } from "vscode-languageserver-textdocument";
import { JSONDocument } from "./jsonDocument.js";
import { RawSchema } from "./schemaWalker.js";
import { fetchSchema, getCachedSchema } from "./schemaFetcher.js";
import { getSchemaStoreUri } from "./schemaStore.js";

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

export function resolveSchema(
  document: TextDocument,
  jsonDoc: JSONDocument,
): ResolvedSchema | null {
  // ── Strategy 1: $schema inline ───────────────────────────────────────────
  const inlineUri = extractInlineSchemaUri(jsonDoc);

  if (inlineUri) {
    const local = schemasByUri.get(inlineUri);
    if (local) return { schema: local, uri: inlineUri };

    const cached = getCachedSchema(inlineUri);
    if (cached) return { schema: cached, uri: inlineUri };

    fetchSchema(inlineUri).then((schema) => {
      if (schema) {
        console.error(`[resolver] schema loaded: ${inlineUri}`);
      }
    });

    return null;
  }

  // ── Strategy 2: filename glob pattern (local) ─────────────────────────────
  for (const assoc of associations) {
    if (matchesPattern(document.uri, assoc.pattern)) {
      return { schema: assoc.schema, uri: assoc.uri };
    }
  }

  // ── Strategy 3: SchemaStore catalog ──────────────────────────────────────
  const schemaStoreUri = getSchemaStoreUri(document.uri);
  if (schemaStoreUri) {
    const cached = getCachedSchema(schemaStoreUri);
    if (cached) return { schema: cached, uri: schemaStoreUri };

    // Trigger background fetch
    fetchSchema(schemaStoreUri).then((schema) => {
      if (schema) {
        console.error(`[resolver] schemaStore schema loaded: ${schemaStoreUri}`);
      }
    });

    return null;
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