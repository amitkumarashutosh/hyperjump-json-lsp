import { addSchema } from "@hyperjump/json-schema/draft-07";

const registered = new Set<string>();

export interface SchemaInput {
  uri: string;
  schema: unknown;
}

export async function registerSchema(input: SchemaInput): Promise<void> {
  if (registered.has(input.uri)) return;
  addSchema(input.schema as any, input.uri);
  registered.add(input.uri);
}

export const DEFAULT_SCHEMA_URI =
  "https://example.com/schemas/person.schema.json";