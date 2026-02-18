console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection";
import { documents } from "./documents";
import { validateDocument } from "./diagnostics";
import { registerSchema, DEFAULT_SCHEMA_URI } from "../json/schemaRegistry";

// Register a test schema so we can verify validation works end-to-end
registerSchema({
  uri: DEFAULT_SCHEMA_URI,
  schema: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      name: { type: "string" },
      age:  { type: "number" },
    },
    required: ["name"],
  },
});

// Initialize
connection.onInitialize(handleInitialize);

// Document lifecycle
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

documents.onDidOpen((event) => {
  validateDocument(event.document);
});

// Bind document manager to connection
documents.listen(connection);

// Start server
connection.listen();