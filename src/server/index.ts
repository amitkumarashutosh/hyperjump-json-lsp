console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection.js";
import { documents } from "./documents.js";
import { validateDocument } from "./diagnostics.js";
import { registerSchema } from "../json/schemaRegistry.js";
import { resolveSchema } from "../json/schemaResolver.js";
import { fetchSchema } from "../json/schemaFetcher.js";
import { getJSONDocument } from "../json/cache.js";
import { getCompletions } from "../json/completion.js";
import { getHover } from "../json/hover.js";
import { getCodeActions } from "../json/codeActions.js";
import { TextDocument } from "vscode-languageserver-textdocument";

// ── Register local schemas ────────────────────────────────────────────────────
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
  pattern: "**/*.person.json",
});

// ── Initialize ────────────────────────────────────────────────────────────────
connection.onInitialize(handleInitialize);

// ── Completion ────────────────────────────────────────────────────────────────
connection.onCompletion(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const jsonDoc = getJSONDocument(document);

    // Try to resolve immediately
    let resolved = resolveSchema(document, jsonDoc);

    // If not resolved yet, check if there's a remote $schema being fetched
    // and wait for it briefly
    if (!resolved) {
      const root = jsonDoc.root;
      if (root?.type === "object") {
        for (const prop of root.children ?? []) {
          const keyNode = prop.children?.[0];
          const valueNode = prop.children?.[1];

          if (
            keyNode?.value === "$schema" &&
            valueNode?.type === "string" &&
            typeof valueNode.value === "string"
          ) {
            const uri = valueNode.value;
            if (uri.startsWith("http://") || uri.startsWith("https://")) {
              // Wait up to 5 seconds for the schema to load
              await fetchSchema(uri);
              resolved = resolveSchema(document, jsonDoc);
            }
            break;
          }
        }
      }
    }

    if (!resolved) return [];

    return getCompletions(document, params.position, resolved.schema);
  } catch (err) {
    console.error("[completion] error:", err);
    return [];
  }
});

// ── Hover ─────────────────────────────────────────────────────────────────────
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

// ── Code Actions ──────────────────────────────────────────────────────────────
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

// Track which schema URIs have already triggered a re-validation
// to prevent infinite loops
const revalidatedUris = new Set<string>();

async function validateWithRetry(document: TextDocument): Promise<void> {
  await validateDocument(document);

  const jsonDoc = getJSONDocument(document);
  const root = jsonDoc.root;
  if (!root || root.type !== "object") return;

  for (const prop of root.children ?? []) {
    const keyNode = prop.children?.[0];
    const valueNode = prop.children?.[1];

    if (
      keyNode?.value === "$schema" &&
      valueNode?.type === "string" &&
      typeof valueNode.value === "string"
    ) {
      const uri = valueNode.value;

      // Only fetch+revalidate once per URI per server session
      if (
        (uri.startsWith("http://") || uri.startsWith("https://")) &&
        !revalidatedUris.has(uri)
      ) {
        revalidatedUris.add(uri);

        fetchSchema(uri).then((schema) => {
          if (schema) {
            const doc = documents.get(document.uri);
            if (doc) {
              console.error("[server] re-validating after schema fetch:", uri);
              validateDocument(doc);
            }
          }
        });
      }
      break;
    }
  }
}

documents.onDidChangeContent((change) => {
  validateWithRetry(change.document);
});

documents.onDidOpen((event) => {
  validateWithRetry(event.document);
});

documents.listen(connection);
connection.listen();