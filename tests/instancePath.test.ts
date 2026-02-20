import { describe, it, expect } from "vitest";
import { resolveJsonPointer } from "../src/json/instancePath.js";
import { parseTree } from "jsonc-parser";

function parse(text: string) {
  return parseTree(text, [], {
    allowTrailingComma: false,
    disallowComments: true,
  });
}

describe("resolveJsonPointer", () => {
  it("returns root node for empty pointer", () => {
    const root = parse('{"name": "Alice"}');
    const node = resolveJsonPointer(root, "");
    expect(node).toBe(root);
  });

  it("returns node for top-level property", () => {
    const root = parse('{"name": "Alice"}');
    const node = resolveJsonPointer(root, "/name");
    expect(node?.value).toBe("Alice");
  });

  it("returns node for nested property", () => {
    const root = parse('{"address": {"city": "NYC"}}');
    const node = resolveJsonPointer(root, "/address/city");
    expect(node?.value).toBe("NYC");
  });

  it("returns node for array item", () => {
    const root = parse('{"tags": ["a", "b", "c"]}');
    const node = resolveJsonPointer(root, "/tags/1");
    expect(node?.value).toBe("b");
  });

  it("returns undefined for unknown path", () => {
    const root = parse('{"name": "Alice"}');
    const node = resolveJsonPointer(root, "/unknown");
    expect(node).toBeUndefined();
  });

  it("handles Hyperjump # prefix", () => {
    const root = parse('{"name": "Alice"}');
    const node = resolveJsonPointer(root, "#/name");
    expect(node?.value).toBe("Alice");
  });

  it("returns undefined for undefined root", () => {
    const node = resolveJsonPointer(undefined, "/name");
    expect(node).toBeUndefined();
  });
});
