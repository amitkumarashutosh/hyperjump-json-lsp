import { Node as JsonNode } from "jsonc-parser";

/**
 * Given an AST root and a JSON Pointer (e.g. "/foo/0/bar"),
 * return the AST node at that location, or undefined if not found.
 *
 * JSON Pointer spec: https://www.rfc-editor.org/rfc/rfc6901
 */
export function resolveJsonPointer(
  root: JsonNode | undefined,
  pointer: string,
): JsonNode | undefined { 
  if (!root) return undefined;

  // Empty pointer = root
  if (pointer === "" || pointer === "/") return root;

  // Split pointer into segments, skip leading empty string from leading "/"
  const segments = pointer.split("/").slice(1).map(decodePointerSegment);

  let current: JsonNode | undefined = root;

  for (const segment of segments) {
    if (!current) return undefined;

    if (current.type === "object") {
      // Find the property whose key matches segment
      current = findObjectProperty(current, segment);
    } else if (current.type === "array") {
      const index = parseInt(segment, 10);
      if (isNaN(index)) return undefined;
      current = current.children?.[index];
    } else {
      // Scalar node — can't go deeper
      return undefined;
    }
  }

  return current;
}

/**
 * In a JSON object node, find the VALUE node for a given key.
 */
function findObjectProperty(
  objectNode: JsonNode,
  key: string,
): JsonNode | undefined {
  if (!objectNode.children) return undefined;

  for (const prop of objectNode.children) {
    // Each property node has 2 children: [keyNode, valueNode]
    const keyNode = prop.children?.[0];
    const valueNode = prop.children?.[1];

    if (keyNode?.value === key) {
      return valueNode;
    }
  }

  return undefined;
}

/**
 * Decode JSON Pointer escape sequences.
 * ~1 → /
 * ~0 → ~
 */
function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}