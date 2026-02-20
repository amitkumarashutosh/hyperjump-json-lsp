import { resolveSchema as resolveRef } from "./refResolver.js";

export interface RawSchema {
  type?: string | string[];
  properties?: Record<string, unknown>;
  items?: unknown;
  enum?: unknown[];
  required?: string[];
  additionalProperties?: unknown;
  $ref?: string;
  definitions?: Record<string, unknown>;
  $defs?: Record<string, unknown>;
  allOf?: unknown[];
  anyOf?: unknown[];
  oneOf?: unknown[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [key: string]: unknown;
}

/**
 * Walk a schema along a path of segments.
 * Resolves $ref at each step.
 */
export function walkSchema(
  schema: RawSchema,
  path: string[],
  rootSchema?: RawSchema,
): RawSchema | undefined {
  // Use schema itself as root if not provided
  const root = rootSchema ?? schema;

  // Resolve $ref at current level
  const resolved = resolveRef(schema, root);

  if (path.length === 0) return resolved;

  const [head, ...tail] = path;
  if (!head) return resolved;

  // Object property
  if (resolved.properties && head in resolved.properties) {
    const sub = resolved.properties[head];
    if (isRawSchema(sub)) {
      return walkSchema(sub, tail, root);
    }
    return undefined;
  }

  // Array items
  if (resolved.items) {
    const index = parseInt(head, 10);
    if (!isNaN(index) && isRawSchema(resolved.items)) {
      return walkSchema(resolved.items, tail, root);
    }
  }

  return undefined;
}

/**
 * Get all property names defined in a schema's `properties` keyword.
 * Resolves $ref before reading properties.
 */
export function getSchemaProperties(
  schema: RawSchema,
  rootSchema?: RawSchema,
): string[] {
  const root = rootSchema ?? schema;
  const resolved = resolveRef(schema, root);

  // Merge properties from allOf/anyOf/oneOf
  const allProps = new Set<string>();

  if (resolved.properties) {
    for (const key of Object.keys(resolved.properties)) {
      allProps.add(key);
    }
  }

  // Also collect from allOf
  for (const sub of resolved.allOf ?? []) {
    if (isRawSchema(sub)) {
      const subResolved = resolveRef(sub, root);
      for (const key of Object.keys(subResolved.properties ?? {})) {
        allProps.add(key);
      }
    }
  }

  return [...allProps];
}

/**
 * Get the subschema for a specific property.
 * Resolves $ref before reading properties.
 */
export function getPropertySchema(
  schema: RawSchema,
  property: string,
  rootSchema?: RawSchema,
): RawSchema | undefined {
  const root = rootSchema ?? schema;
  const resolved = resolveRef(schema, root);

  // Check direct properties
  const sub = resolved.properties?.[property];
  if (isRawSchema(sub)) {
    return resolveRef(sub, root);
  }

  // Check allOf
  for (const s of resolved.allOf ?? []) {
    if (isRawSchema(s)) {
      const subResolved = resolveRef(s, root);
      const prop = subResolved.properties?.[property];
      if (isRawSchema(prop)) {
        return resolveRef(prop, root);
      }
    }
  }

  return undefined;
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
