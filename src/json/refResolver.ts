import { RawSchema } from "./schemaWalker.js";

/**
 * Resolve a $ref pointer against a root schema.
 * Only handles local refs starting with "#".
 *
 * e.g. "#/definitions/Address" → schema.definitions.Address
 * e.g. "#/$defs/Address" → schema.$defs.Address
 */
export function resolveRef(
  ref: string,
  rootSchema: RawSchema,
): RawSchema | undefined {
  // Only handle local refs
  if (!ref.startsWith("#")) return undefined;

  // "#" alone means the root schema
  if (ref === "#") return rootSchema;

  // Strip the leading "#/" and split into segments
  const pointer = ref.slice(2); // remove "#/"
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
 * Check if a schema node is a $ref.
 */
export function isRef(schema: RawSchema): boolean {
  return typeof schema["$ref"] === "string";
}

/**
 * Resolve a schema — if it's a $ref, follow it.
 * Returns the resolved schema or the original if not a ref.
 * Handles circular refs by tracking visited refs.
 */
export function resolveSchema(
  schema: RawSchema,
  rootSchema: RawSchema,
  visited = new Set<string>(),
): RawSchema {
  if (!isRef(schema)) return schema;

  const ref = schema["$ref"] as string;

  // Prevent infinite loops from circular refs
  if (visited.has(ref)) return schema;
  visited.add(ref);

  const resolved = resolveRef(ref, rootSchema);
  if (!resolved) return schema;

  // Recursively resolve in case the target is also a $ref
  return resolveSchema(resolved, rootSchema, visited);
}

/**
 * Decode JSON Pointer escape sequences.
 * ~1 → /
 * ~0 → ~
 */
function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}
