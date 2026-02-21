import { RawSchema } from "./schemaWalker.js";

/**
 * Resolve a $ref pointer against a root schema.
 * Handles:
 * - Local refs: "#/definitions/Foo"
 * - $id-based refs: resolves against schema with matching $id
 * - Root ref: "#"
 */
export function resolveRef(
  ref: string,
  rootSchema: RawSchema,
): RawSchema | undefined {
  if (!ref.startsWith("#")) return undefined;
  if (ref === "#") return rootSchema;

  const pointer = ref.slice(2);
  const segments = pointer.split("/").map(decodePointerSegment);

  let current: unknown = rootSchema;

  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== "object" || current === null) return undefined;
  return current as RawSchema;
}

/**
 * Resolve a $dynamicRef against a root schema.
 * $dynamicRef uses the anchor name (without #) to find
 * a $dynamicAnchor in the schema tree.
 *
 * e.g. "$dynamicRef": "#items" → find schema with "$dynamicAnchor": "items"
 */
export function resolveDynamicRef(
  dynamicRef: string,
  rootSchema: RawSchema,
): RawSchema | undefined {
  // Extract anchor name — remove leading "#"
  const anchor = dynamicRef.startsWith("#") ? dynamicRef.slice(1) : dynamicRef;

  if (!anchor) return rootSchema;

  // Search the entire schema tree for a matching $dynamicAnchor
  return findDynamicAnchor(anchor, rootSchema);
}

/**
 * Build an $id index — map of $id URI → subschema.
 * Used to resolve $ref URIs that aren't JSON Pointers.
 */
export function buildIdIndex(
  schema: RawSchema,
  index = new Map<string, RawSchema>(),
): Map<string, RawSchema> {
  if (typeof schema.$id === "string") {
    index.set(schema.$id, schema);
  }

  // Recurse into known schema locations
  if (schema.properties) {
    for (const sub of Object.values(schema.properties)) {
      if (isRawSchema(sub)) buildIdIndex(sub, index);
    }
  }

  for (const key of ["definitions", "$defs"] as const) {
    const defs = schema[key];
    if (defs && typeof defs === "object") {
      for (const sub of Object.values(defs)) {
        if (isRawSchema(sub)) buildIdIndex(sub, index);
      }
    }
  }

  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    for (const sub of schema[key] ?? []) {
      if (isRawSchema(sub)) buildIdIndex(sub, index);
    }
  }

  if (isRawSchema(schema.items)) {
    buildIdIndex(schema.items, index);
  }

  return index;
}

/**
 * Check if a schema node is a $ref.
 */
export function isRef(schema: RawSchema): boolean {
  return typeof schema["$ref"] === "string";
}

/**
 * Check if a schema node is a $dynamicRef.
 */
export function isDynamicRef(schema: RawSchema): boolean {
  return typeof schema["$dynamicRef"] === "string";
}

/**
 * Resolve a schema — handles both $ref and $dynamicRef.
 * Returns the resolved schema or the original if not a ref.
 * Handles circular refs by tracking visited refs.
 */
export function resolveSchema(
  schema: RawSchema,
  rootSchema: RawSchema,
  visited = new Set<string>(),
): RawSchema {
  // Handle $ref
  if (isRef(schema)) {
    const ref = schema["$ref"] as string;

    if (visited.has(ref)) return schema;
    visited.add(ref);

    const resolved = resolveRef(ref, rootSchema);
    if (!resolved) return schema;

    return resolveSchema(resolved, rootSchema, visited);
  }

  // Handle $dynamicRef
  if (isDynamicRef(schema)) {
    const dynamicRef = schema["$dynamicRef"] as string;
    const key = `$dynamicRef:${dynamicRef}`;

    if (visited.has(key)) return schema;
    visited.add(key);

    const resolved = resolveDynamicRef(dynamicRef, rootSchema);
    if (!resolved) return schema;

    return resolveSchema(resolved, rootSchema, visited);
  }

  return schema;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively search a schema tree for a $dynamicAnchor value.
 */
function findDynamicAnchor(
  anchor: string,
  schema: RawSchema,
  visited = new Set<RawSchema>(),
): RawSchema | undefined {
  if (visited.has(schema)) return undefined;
  visited.add(schema);

  if (schema.$dynamicAnchor === anchor) return schema;

  // Search definitions/$defs
  for (const key of ["definitions", "$defs"] as const) {
    const defs = schema[key];
    if (defs && typeof defs === "object") {
      for (const sub of Object.values(defs)) {
        if (isRawSchema(sub)) {
          const found = findDynamicAnchor(anchor, sub, visited);
          if (found) return found;
        }
      }
    }
  }

  // Search properties
  if (schema.properties) {
    for (const sub of Object.values(schema.properties)) {
      if (isRawSchema(sub)) {
        const found = findDynamicAnchor(anchor, sub, visited);
        if (found) return found;
      }
    }
  }

  // Search allOf/anyOf/oneOf
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    for (const sub of schema[key] ?? []) {
      if (isRawSchema(sub)) {
        const found = findDynamicAnchor(anchor, sub, visited);
        if (found) return found;
      }
    }
  }

  return undefined;
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function isRawSchema(value: unknown): value is RawSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
