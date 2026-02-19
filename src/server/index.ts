console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection.js";
import { documents } from "./documents.js";
import { validateDocument } from "./diagnostics.js";
import { registerSchema, DEFAULT_SCHEMA_URI } from "../json/schemaRegistry.js";

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
documents.onDidChangeContent((change:any) => {
  validateDocument(change.document);
});

documents.onDidOpen((event:any) => {
  validateDocument(event.document);
});

// Bind document manager to connection
documents.listen(connection);

// Start server
connection.listen();