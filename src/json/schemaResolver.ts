import { TextDocument } from "vscode-languageserver-textdocument";
import { JSONDocument } from "./jsonDocument.js";
import { RawSchema } from "./schemaWalker.js";

//  A schema association maps a glob pattern to a schema.
//  e.g. { pattern: "**/*.person.json", schema: { ... } }
export interface SchemaAssociation {
  pattern: string;
  uri: string;
  schema: RawSchema;
}

// In-memory registry of schema associations
const associations: SchemaAssociation[] = [];

// In-memory registry of schemas by URI
const schemasByUri = new Map<string, RawSchema>();

/**
 * Register a schema with a URI and optional glob pattern.
 */
export function registerSchemaAssociation(
  association: SchemaAssociation,
): void {
  schemasByUri.set(association.uri, association.schema);

  // Only add pattern association if pattern is provided
  if (association.pattern) {
    associations.push(association);
    console.error(
      "[resolver] associations now:",
      associations.length,
      "patterns:",
      associations.map((a) => a.pattern),
    );
  }
}

/**
 * Resolve the correct schema for a given document.
 *
 * Resolution order:
 * 1. $schema property inside the document
 * 2. Filename glob pattern match
 * 3. null (no schema found)
 */

export interface ResolvedSchema {
  schema: RawSchema;
  uri: string;
}

export function resolveSchema(
  document: TextDocument,
  jsonDoc: JSONDocument,
): ResolvedSchema | null {
  // ── Strategy 1: $schema inline ─────────────────────────────────────────
  const inlineUri = extractInlineSchemaUri(jsonDoc);
  if (inlineUri) {
    const schema = schemasByUri.get(inlineUri);
    if (schema) return { schema, uri: inlineUri };
  }

  // ── Strategy 2: filename glob pattern ──────────────────────────────────
  for (const assoc of associations) {
    if (matchesPattern(document.uri, assoc.pattern)) {
      return { schema: assoc.schema, uri: assoc.uri };
    }
  }

  return null;
}

/**
 * Extract the value of the $schema property from the root of a JSON document.
 * Returns undefined if not found or not a string.
 */
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

/**
 * Simple glob pattern matching.
 * Supports: * (any chars except /) and ** (any chars including /)
 */
function matchesPattern(uri: string, pattern: string): boolean {
  if (!pattern) return false;

  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex special chars
    .replace(/\*\*/g, "(.+)") // ** = any path
    .replace(/\*/g, "([^/]+)"); // * = any filename segment

  const regex = new RegExp(`${escaped}$`);

  // Match against the full URI and also just the filename
  const filename = uri.split("/").pop() ?? "";
  return regex.test(uri) || regex.test(filename);
}
