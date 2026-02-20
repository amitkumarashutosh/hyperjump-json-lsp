import { describe, it, expect } from "vitest";
import { getHover } from "../src/json/hover.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RawSchema } from "../src/json/schemaWalker.js";

const schema: RawSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Full name" },
    age: { type: "number" },
  },
  required: ["name"],
};

function makeDoc(content: string): TextDocument {
  return TextDocument.create("file:///test.json", "json", 1, content);
}

describe("getHover", () => {
  it("returns hover for a known property key", () => {
    const content = '{"name": "Alice"}';
    const doc = makeDoc(content);
    // Position at the `n` in "name"
    const position = { line: 0, character: 2 };

    const hover = getHover(doc, position, schema);
    expect(hover).not.toBeNull();
    expect(hover?.contents).toBeDefined();
    const value = (hover?.contents as any).value as string;
    expect(value).toContain("name");
    expect(value).toContain("string");
    expect(value).toContain("required");
  });

  it("returns null for unknown property", () => {
    const content = '{"unknown": 123}';
    const doc = makeDoc(content);
    const position = { line: 0, character: 2 };

    const hover = getHover(doc, position, schema);
    expect(hover).toBeNull();
  });

  it("returns hover with description", () => {
    const content = '{"name": "Alice"}';
    const doc = makeDoc(content);
    const position = { line: 0, character: 2 };

    const hover = getHover(doc, position, schema);
    const value = (hover?.contents as any).value as string;
    expect(value).toContain("Full name");
  });

  it("shows optional for non-required property", () => {
    const content = '{"age": 30}';
    const doc = makeDoc(content);
    const position = { line: 0, character: 2 };

    const hover = getHover(doc, position, schema);
    const value = (hover?.contents as any).value as string;
    expect(value).toContain("optional");
  });
});
