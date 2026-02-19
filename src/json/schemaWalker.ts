/**
 * A minimal raw JSON Schema shape.
 * We use `unknown` for nested values since schemas can be deeply nested.
 */
export interface RawSchema {
  type?: string | string[];
  properties?: Record<string, unknown>;
  items?: unknown;
  enum?: unknown[];
  required?: string[];
  additionalProperties?: unknown;
  [key: string]: unknown;
}

/**
 * Walk a schema along a path of segments.
 * e.g. path = ["address", "city"] on a schema with properties.address.properties.city
 * returns the subschema for city.
 *
 * Returns the root schema if path is empty.
 * Returns undefined if the path cannot be resolved.
 */
export function walkSchema(
  schema: RawSchema,
  path: string[],
): RawSchema | undefined {
  if (path.length === 0) return schema;

  const [head, ...tail] = path;

  if (!head) return schema;

  // Object property
  if (schema.properties && head in schema.properties) {
    const sub = schema.properties[head];
    if (isRawSchema(sub)) {
      return walkSchema(sub, tail);
    }
    return undefined;
  }

  // Array items
  if (schema.items) {
    // If head is a number index into an array schema
    const index = parseInt(head, 10);
    if (!isNaN(index) && isRawSchema(schema.items)) {
      return walkSchema(schema.items, tail);
    }
  }

  return undefined;
}

/**
 * Get all property names defined in a schema's `properties` keyword.
 */
export function getSchemaProperties(schema: RawSchema): string[] {
  if (!schema.properties) return [];
  return Object.keys(schema.properties);
}

/**
 * Get the subschema for a specific property.
 */
export function getPropertySchema(
  schema: RawSchema,
  property: string,
): RawSchema | undefined {
  const sub = schema.properties?.[property];
  return isRawSchema(sub) ? sub : undefined;
}

/**
 * Check if a property is required in this schema.
 */
export function isRequired(schema: RawSchema, property: string): boolean {
  return schema.required?.includes(property) ?? false;
}

function isRawSchema(value: unknown): value is RawSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
