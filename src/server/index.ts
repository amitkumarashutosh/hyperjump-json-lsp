console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection.js";
import { documents } from "./documents.js";
import { validateDocument } from "./diagnostics.js";
import { registerSchema, DEFAULT_SCHEMA_URI } from "../json/schemaRegistry.js";
import { getCompletions } from "../json/completion.js";
import { getHover } from "../json/hover.js";

// Hardcoded test schema
const TEST_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
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
  uri: DEFAULT_SCHEMA_URI,
  schema: TEST_SCHEMA,
});

// Initialize
connection.onInitialize(handleInitialize);

connection.onCompletion((params) => {
  console.error("[completion] CALLED at", JSON.stringify(params.position));

  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      console.error("[completion] no document found");
      return [];
    }

    const items = getCompletions(document, params.position, TEST_SCHEMA);
    console.error("[completion] items returned:", items.length);
    return items;
  } catch (err) {
    console.error("[completion] CRASHED:", err);
    return [];
  }
});

// Hover
connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  return getHover(document, params.position, TEST_SCHEMA);
});

// Document lifecycle
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidOpen((event) => {
  validateDocument(event.document);
});

documents.listen(connection);
connection.listen();
