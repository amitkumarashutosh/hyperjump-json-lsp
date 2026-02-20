import { describe, it, expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver/node";
import { getCodeActions } from "../src/json/codeActions.js";
import { RawSchema } from "../src/json/schemaWalker.js";

const schema: RawSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "number" },
  },
  required: ["name"],
};

function makeDoc(content: string): TextDocument {
  return TextDocument.create("file:///test.json", "json", 1, content);
}

function makeDiagnostic(
  message: string,
  startOffset: number,
  endOffset: number,
  doc: TextDocument,
) {
  return {
    message,
    severity: DiagnosticSeverity.Error,
    range: {
      start: doc.positionAt(startOffset),
      end: doc.positionAt(endOffset),
    },
    source: "hyperjump-json-lsp",
  };
}

describe("getCodeActions", () => {
  it("returns add-property action for missing required", () => {
    const content = '{ "age": 30 }';
    const doc = makeDoc(content);
    const diagnostic = makeDiagnostic(
      "Missing required property at root",
      0,
      content.length,
      doc,
    );

    const actions = getCodeActions(doc, [diagnostic], schema);
    expect(actions.length).toBeGreaterThan(0);

    const titles = actions.map((a) => a.title);
    expect(titles).toContain('Add missing property "name"');
  });

  it("does not suggest already-present required property", () => {
    const content = '{ "name": "Alice" }';
    const doc = makeDoc(content);
    const diagnostic = makeDiagnostic(
      "Missing required property at root",
      0,
      content.length,
      doc,
    );

    const actions = getCodeActions(doc, [diagnostic], schema);
    const titles = actions.map((a) => a.title);
    expect(titles).not.toContain('Add missing property "name"');
  });

  it("returns convert action for wrong type", () => {
    const content = '{ "name": 123 }';
    const doc = makeDoc(content);
    // Diagnostic points at `123`
    const numOffset = content.indexOf("123");
    const diagnostic = makeDiagnostic(
      'Incorrect type at "/name"',
      numOffset,
      numOffset + 3,
      doc,
    );

    const actions = getCodeActions(doc, [diagnostic], schema);
    const titles = actions.map((a) => a.title);
    expect(titles).toContain("Convert to string");
  });

  it("ignores diagnostics from other sources", () => {
    const content = '{ "age": 30 }';
    const doc = makeDoc(content);
    const diagnostic = {
      message: "Missing required property at root",
      severity: DiagnosticSeverity.Error,
      range: { start: doc.positionAt(0), end: doc.positionAt(content.length) },
      source: "some-other-lsp",
    };

    const actions = getCodeActions(doc, [diagnostic], schema);
    expect(actions).toHaveLength(0);
  });

  it("returns empty array when no root", () => {
    const doc = makeDoc("");
    const actions = getCodeActions(doc, [], schema);
    expect(actions).toHaveLength(0);
  });
});
