import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { formatDocument } from "../src/json/formatter.js";

function makeDoc(content: string): TextDocument {
  return TextDocument.create("file:///test.json", "json", 1, content);
}

const defaultOptions = {
  tabSize: 2,
  insertSpaces: true,
};

describe("formatDocument", () => {
  it("returns empty array for already formatted document", () => {
    const content = '{\n  "name": "Alice"\n}\n';
    const doc = makeDoc(content);
    const edits = formatDocument(doc, defaultOptions);
    expect(edits).toHaveLength(0);
  });

  it("formats a minified JSON document", () => {
    const doc = makeDoc('{"name":"Alice","age":30}');
    const edits = formatDocument(doc, defaultOptions);

    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toBe('{\n  "name": "Alice",\n  "age": 30\n}\n');
  });

  it("formats with tab indentation when insertSpaces is false", () => {
    const doc = makeDoc('{"name":"Alice"}');
    const edits = formatDocument(doc, {
      tabSize: 2,
      insertSpaces: false,
    });

    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toBe('{\n\t"name": "Alice"\n}\n');
  });

  it("formats with 4 space indentation", () => {
    const doc = makeDoc('{"name":"Alice"}');
    const edits = formatDocument(doc, {
      tabSize: 4,
      insertSpaces: true,
    });

    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toBe('{\n    "name": "Alice"\n}\n');
  });

  it("formats nested objects", () => {
    const doc = makeDoc('{"address":{"city":"NYC","zip":"10001"}}');
    const edits = formatDocument(doc, defaultOptions);

    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toContain('"address"');
    expect(edits[0]?.newText).toContain('"city"');
    expect(edits[0]?.newText).toContain('"zip"');
  });

  it("formats arrays", () => {
    const doc = makeDoc('{"tags":["a","b","c"]}');
    const edits = formatDocument(doc, defaultOptions);

    expect(edits).toHaveLength(1);
    expect(edits[0]?.newText).toContain('"tags"');
    expect(edits[0]?.newText).toContain('"a"');
  });

  it("returns empty array for document with syntax errors", () => {
    const doc = makeDoc('{"name":}');
    const edits = formatDocument(doc, defaultOptions);
    expect(edits).toHaveLength(0);
  });

  it("replaces entire document range", () => {
    const content = '{"name":"Alice"}';
    const doc = makeDoc(content);
    const edits = formatDocument(doc, defaultOptions);

    expect(edits[0]?.range.start).toEqual({ line: 0, character: 0 });
      expect(edits[0]?.range.end).toEqual({
      line: 0,
      character: content.length,
    });
  });
});
