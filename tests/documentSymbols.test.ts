import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SymbolKind } from "vscode-languageserver/node.js";
import { getDocumentSymbols } from "../src/json/documentSymbols.js";

function makeDoc(content: string): TextDocument {
  return TextDocument.create("file:///test.json", "json", 1, content);
}

describe("getDocumentSymbols", () => {
  it("returns empty array for empty document", () => {
    const doc = makeDoc("");
    expect(getDocumentSymbols(doc)).toHaveLength(0);
  });

  it("returns symbols for flat object", () => {
    const doc = makeDoc('{ "name": "Alice", "age": 30 }');
    const symbols = getDocumentSymbols(doc);

    expect(symbols).toHaveLength(2);
    expect(symbols[0]?.name).toBe("name");
    expect(symbols[0]?.kind).toBe(SymbolKind.String);
    expect(symbols[1]?.name).toBe("age");
    expect(symbols[1]?.kind).toBe(SymbolKind.Number);
  });

  it("returns nested symbols for nested object", () => {
    const doc = makeDoc('{ "address": { "city": "NYC", "zip": "10001" } }');
    const symbols = getDocumentSymbols(doc);

    expect(symbols).toHaveLength(1);
    expect(symbols[0]?.name).toBe("address");
    expect(symbols[0]?.kind).toBe(SymbolKind.Module);
    expect(symbols[0]?.children).toHaveLength(2);
    expect(symbols[0]?.children?.[0]?.name).toBe("city");
    expect(symbols[0]?.children?.[1]?.name).toBe("zip");
  });

  it("returns symbols for array items", () => {
    const doc = makeDoc('{ "tags": ["a", "b", "c"] }');
    const symbols = getDocumentSymbols(doc);

    expect(symbols[0]?.name).toBe("tags");
    expect(symbols[0]?.kind).toBe(SymbolKind.Array);
    expect(symbols[0]?.children).toHaveLength(3);
    expect(symbols[0]?.children?.[0]?.name).toBe("[0]");
    expect(symbols[0]?.children?.[1]?.name).toBe("[1]");
  });

  it("shows correct detail for values", () => {
    const doc = makeDoc(
      '{ "name": "Alice", "age": 30, "active": true, "data": null }',
    );
    const symbols = getDocumentSymbols(doc);

    expect(symbols[0]?.detail).toBe('"Alice"');
    expect(symbols[1]?.detail).toBe("30");
    expect(symbols[2]?.detail).toBe("true");
    expect(symbols[3]?.detail).toBe("null");
  });

  it("shows property count for object detail", () => {
    const doc = makeDoc('{ "address": { "city": "NYC" } }');
    const symbols = getDocumentSymbols(doc);

    expect(symbols[0]?.detail).toBe("{1 property}");
  });

  it("shows item count for array detail", () => {
    const doc = makeDoc('{ "tags": [1, 2, 3] }');
    const symbols = getDocumentSymbols(doc);

    expect(symbols[0]?.detail).toBe("[3 items]");
  });

  it("handles boolean and null types", () => {
    const doc = makeDoc('{ "active": true, "data": null }');
    const symbols = getDocumentSymbols(doc);

    expect(symbols[0]?.kind).toBe(SymbolKind.Boolean);
    expect(symbols[1]?.kind).toBe(SymbolKind.Null);
  });
});
