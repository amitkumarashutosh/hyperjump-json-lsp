import { Node as JsonNode } from "jsonc-parser";

/**
 * Given an AST root and a JSON Pointer (e.g. "/foo/0/bar"),
 * return the AST node at that location, or undefined if not found.
 *
 * Also handles Hyperjump-style "#/foo" pointers defensively.
 */
export function resolveJsonPointer(
  root: JsonNode | undefined,
  pointer: string,
): JsonNode | undefined {
  if (!root) return undefined;

  // Normalize: strip leading # if present (Hyperjump format)
  const normalized = pointer.startsWith("#") ? pointer.slice(1) : pointer;

  // Empty pointer = root
  if (normalized === "" || normalized === "/") return root;

  const segments = normalized.split("/").slice(1).map(decodePointerSegment);

  let current: JsonNode | undefined = root;

  for (const segment of segments) {
    if (!current) return undefined;

    if (current.type === "object") {
      current = findObjectProperty(current, segment);
    } else if (current.type === "array") {
      const index = parseInt(segment, 10);
      if (isNaN(index)) return undefined;
      current = current.children?.[index];
    } else {
      return undefined;
    }
  }

  return current;
}

function findObjectProperty(
  objectNode: JsonNode,
  key: string,
): JsonNode | undefined {
  if (!objectNode.children) return undefined;

  for (const prop of objectNode.children) {
    const keyNode = prop.children?.[0];
    const valueNode = prop.children?.[1];
    if (keyNode?.value === key) {
      return valueNode;
    }
  }

  return undefined;
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}