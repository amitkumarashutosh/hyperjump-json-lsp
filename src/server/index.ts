console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection.js";
import { documents } from "./documents.js";
import { validateDocument } from "./diagnostics.js";
import { registerSchema } from "../json/schemaRegistry.js";
import { resolveSchema } from "../json/schemaResolver.js";
import { getJSONDocument } from "../json/cache.js";
import { getCompletions } from "../json/completion.js";
import { getHover } from "../json/hover.js";
import { getCodeActions } from "../json/codeActions.js";

// ── Register schemas ──────────────────────────────────────────────────────────
// Each schema can have:
//   uri     — used for $schema inline resolution
//   pattern — used for filename glob resolution

const PERSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object" as const,
  properties: {
    name: { type: "string", description: "The person's full name" },
    age: { type: "number", description: "Age in years" },
    active: { type: "boolean", description: "Whether the account is active" },
    address: {
      type: "object",
      description: "Mailing address",
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["city"],
    },
  },
  required: ["name"],
};

registerSchema({
  uri: "https://example.com/schemas/person.schema.json",
  schema: PERSON_SCHEMA,
  pattern: "**/*.person.json", // also matches by filename
});

// ── Initialize ────────────────────────────────────────────────────────────────
connection.onInitialize(handleInitialize);

// ── Completion ────────────────────────────────────────────────────────────────
connection.onCompletion((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const jsonDoc = getJSONDocument(document);
    const resolved = resolveSchema(document, jsonDoc);
    if (!resolved) return [];

    return getCompletions(document, params.position, resolved.schema);
  } catch (err) {
    console.error("[completion] error:", err);
    return [];
  }
});

// Hover
connection.onHover((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const jsonDoc = getJSONDocument(document);
    const resolved = resolveSchema(document, jsonDoc);
    if (!resolved) return null;

    return getHover(document, params.position, resolved.schema);
  } catch (err) {
    console.error("[hover] error:", err);
    return null;
  }
});

connection.onCodeAction((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const jsonDoc = getJSONDocument(document);
    const resolved = resolveSchema(document, jsonDoc);
    if (!resolved) return [];

    return getCodeActions(
      document,
      params.context.diagnostics,
      resolved.schema,
    );
  } catch (err) {
    console.error("[codeAction] error:", err);
    return [];
  }
});

// ── Document lifecycle ────────────────────────────────────────────────────────
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidOpen((event) => {
  validateDocument(event.document);
});

documents.listen(connection);
connection.listen();
