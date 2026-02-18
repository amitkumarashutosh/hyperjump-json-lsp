import * as Schema from "@hyperjump/json-schema/draft-07";

// Internal registry of schemas we've loaded.
// Key: schema URI (the $id or the URI you assigned)
const registered = new Set<string>();

export interface SchemaInput {
  uri: string;
  schema: unknown;
}

/**
 * Register a JSON Schema with Hyperjump.
 * Safe to call multiple times for the same URI — will not double-register.
 */
export async function registerSchema(input: SchemaInput): Promise<void> {
  if (registered.has(input.uri)) return;

  Schema.addSchema(input.schema as any, input.uri);
  registered.add(input.uri);
}

/**
 * For now, we hardcode a default schema URI for testing.
 * In Phase 4, this will be resolved dynamically from the document.
 */
export const DEFAULT_SCHEMA_URI =
  "https://example.com/schemas/person.schema.json";