import { describe, it, expect, beforeEach } from "vitest";
import {
  registerSchemaAssociation,
  resolveSchema,
} from "../src/json/schemaResolver.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { JSONDocument } from "../src/json/jsonDocument.js";

const personSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
  },
  required: ["name"],
};

function makeDocument(uri: string, content: string): TextDocument {
  return TextDocument.create(uri, "json", 1, content);
}

function makeJsonDoc(content: string, uri: string): JSONDocument {
  const doc = makeDocument(uri, content);
  return new JSONDocument(doc);
}

describe("resolveSchema", () => {
  beforeEach(() => {
    // Register a test schema before each test
    registerSchemaAssociation({
      uri: "https://example.com/person.json",
      schema: personSchema,
      pattern: "**/*.person.json",
    });
  });

  it("resolves schema by $schema inline URI", () => {
    const content =
      '{"$schema": "https://example.com/person.json", "name": "Alice"}';
    const doc = makeDocument("file:///test.json", content);
    const jsonDoc = makeJsonDoc(content, "file:///test.json");

    const resolved = resolveSchema(doc, jsonDoc);
    expect(resolved).not.toBeNull();
    expect(resolved?.uri).toBe("https://example.com/person.json");
  });

  it("resolves schema by filename pattern", () => {
    const content = '{"name": "Alice"}';
    const doc = makeDocument("file:///project/test.person.json", content);
    const jsonDoc = makeJsonDoc(content, "file:///project/test.person.json");

    const resolved = resolveSchema(doc, jsonDoc);
    expect(resolved).not.toBeNull();
    expect(resolved?.schema).toBe(personSchema);
  });

  it("returns null for unmatched document", () => {
    const content = '{"name": "Alice"}';
    const doc = makeDocument("file:///project/test.json", content);
    const jsonDoc = makeJsonDoc(content, "file:///project/test.json");

    const resolved = resolveSchema(doc, jsonDoc);
    expect(resolved).toBeNull();
  });

  it("prefers inline $schema over pattern", () => {
    const otherSchema = {
      type: "object",
      properties: { age: { type: "number" } },
    };
    registerSchemaAssociation({
      uri: "https://example.com/other.json",
      schema: otherSchema,
      pattern: "",
    });

    const content = '{"$schema": "https://example.com/other.json"}';
    const doc = makeDocument("file:///test.person.json", content);
    const jsonDoc = makeJsonDoc(content, "file:///test.person.json");

    const resolved = resolveSchema(doc, jsonDoc);
    expect(resolved?.uri).toBe("https://example.com/other.json");
  });
});
