import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getCompletions } from "../src/json/completion.js";
import { RawSchema } from "../src/json/schemaWalker.js";

const schema: RawSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Full name" },
    age: { type: "number" },
    active: { type: "boolean" },
    address: {
      type: "object",
      properties: {
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["city"],
    },
  },
  required: ["name"],
};

function makeDoc(content: string): TextDocument {
  return TextDocument.create("file:///test.json", "json", 1, content);
}

/**
 * Find the offset of a substring and return a Position.
 * This lets tests target exact locations without hardcoding character numbers.
 */
function positionOf(
  doc: TextDocument,
  substring: string,
  occurrence = 0,
): { line: number; character: number } {
  const text = doc.getText();
  let idx = -1;
  for (let i = 0; i <= occurrence; i++) {
    idx = text.indexOf(substring, idx + 1);
    if (idx === -1) throw new Error(`substring "${substring}" not found`);
  }
  return doc.positionAt(idx);
}

describe("getCompletions", () => {
  it("returns property suggestions at root object", () => {
    // Use a complete-enough document so jsonc-parser can build an AST node
    const content = '{ "na": 1 }';
    const doc = makeDoc(content);
    // Position inside the "na" key string — this is a string node in key position
    const pos = positionOf(doc, "na");
    const items = getCompletions(doc, pos, schema);

    const labels = items.map((i) => i.label);
    expect(labels).toContain("name");
    expect(labels).toContain("age");
    expect(labels).toContain("active");
    expect(labels).toContain("address");
  });

  it("sorts required properties first", () => {
    const content = '{ "na": 1 }';
    const doc = makeDoc(content);
    const pos = positionOf(doc, "na");
    const items = getCompletions(doc, pos, schema);

    const nameItem = items.find((i) => i.label === "name");
    const ageItem = items.find((i) => i.label === "age");

    expect(nameItem?.sortText).toBe("0_name");
    expect(ageItem?.sortText).toBe("1_age");
  });

  it("excludes already existing keys", () => {
    const content = '{ "name": "Alice", "ag": 1 }';
    const doc = makeDoc(content);
    const pos = positionOf(doc, "ag");
    const items = getCompletions(doc, pos, schema);

    const labels = items.map((i) => i.label);
    expect(labels).not.toContain("name");
    expect(labels).toContain("age");
  });

  it("returns nested property suggestions", () => {
    const content = '{ "address": { "ci": "x" } }';
    const doc = makeDoc(content);
    const pos = positionOf(doc, "ci");
    const items = getCompletions(doc, pos, schema);

    const labels = items.map((i) => i.label);
    expect(labels).toContain("city");
    expect(labels).toContain("zip");
    expect(labels).not.toContain("name");
  });

  it("returns boolean value suggestions", () => {
    const content = '{ "active": true }';
    const doc = makeDoc(content);
    // Position on the value "true"
    const pos = positionOf(doc, "true");
    const items = getCompletions(doc, pos, schema);

    const labels = items.map((i) => i.label);
    expect(labels).toContain("true");
    expect(labels).toContain("false");
  });

  it("returns empty array when no properties in schema", () => {
    const emptySchema: RawSchema = { type: "object" };
    const content = '{ "na": 1 }';
    const doc = makeDoc(content);
    const pos = positionOf(doc, "na");
    const items = getCompletions(doc, pos, emptySchema);
    expect(items).toHaveLength(0);
  });

  it("returns empty array for empty document", () => {
    const content = "";
    const doc = makeDoc(content);
    const items = getCompletions(doc, { line: 0, character: 0 }, schema);
    expect(items).toHaveLength(0);
  });
});
