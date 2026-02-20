import { addSchema } from "@hyperjump/json-schema/draft-07";
import { registerSchemaAssociation } from "./schemaResolver.js";
import { RawSchema } from "./schemaWalker.js";

const registered = new Set<string>();

export interface SchemaInput {
  uri: string;
  schema: RawSchema;
  pattern?: string;
}

/**
 * Register a JSON Schema with both Hyperjump (for validation)
 * and the schema resolver (for completion/hover).
 */
export function registerSchema(input: SchemaInput): void {
  if (!registered.has(input.uri)) {
    addSchema(input.schema as any, input.uri);
    registered.add(input.uri);
  }
  console.error(
    "[registry] registering pattern:",
    input.pattern,
    "for uri:",
    input.uri,
  );

  // Always register with the resolver (even if Hyperjump already has it)
  registerSchemaAssociation({
    uri: input.uri,
    schema: input.schema,
    pattern: input.pattern ?? "",
  });
}

export const DEFAULT_SCHEMA_URI =
  "https://example.com/schemas/person.schema.json";
