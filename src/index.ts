console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection";
import { documents } from "./documents";
import { validateDocument } from "./diagnostics";

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
