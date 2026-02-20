console.error("✅ Hyperjump JSON LSP Server Started");

import { connection, handleInitialize } from "./connection.js";
import { documents } from "./documents.js";
import { validateDocument } from "./diagnostics.js";
import { registerSchema } from "../json/schemaRegistry.js";
import { resolveSchema, ResolvedSchema } from "../json/schemaResolver.js";
import { fetchSchema } from "../json/schemaFetcher.js";
import {
  loadSchemaStoreCatalog,
  resolveSchemaStoreSchema,
} from "../json/schemaStore.js";
import { getJSONDocument } from "../json/cache.js";
import { getCompletions } from "../json/completion.js";
import { getHover } from "../json/hover.js";
import { getCodeActions } from "../json/codeActions.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { JSONDocument } from "../json/jsonDocument.js";

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

// ── Load SchemaStore catalog at startup ───────────────────────────────────────
loadSchemaStoreCatalog().catch((err) => {
  console.error("[server] failed to load SchemaStore catalog:", err);
});

// ── Initialize ────────────────────────────────────────────────────────────────
connection.onInitialize(handleInitialize);

// ── Schema resolution with fetch ──────────────────────────────────────────────

async function resolveSchemaWithFetch(
  document: TextDocument,
  jsonDoc: JSONDocument,
): Promise<ResolvedSchema | null> {
  let resolved = resolveSchema(document, jsonDoc);
  if (resolved) return resolved;

  const root = jsonDoc.root;
  let inlineSchemaUri: string | undefined;

  if (root?.type === "object") {
    for (const prop of root.children ?? []) {
      const keyNode = prop.children?.[0];
      const valueNode = prop.children?.[1];

      if (
        keyNode?.value === "$schema" &&
        valueNode?.type === "string" &&
        typeof valueNode.value === "string"
      ) {
        inlineSchemaUri = valueNode.value;
        break;
      }
    }
  }

  if (inlineSchemaUri) {
    if (
      inlineSchemaUri.startsWith("http://") ||
      inlineSchemaUri.startsWith("https://")
    ) {
      console.error(
        "[resolveWithFetch] waiting for inline schema:",
        inlineSchemaUri,
      );
      await fetchSchema(inlineSchemaUri);
      return resolveSchema(document, jsonDoc);
    }
    return null;
  }

  // No inline $schema — try SchemaStore by filename
  console.error("[resolveWithFetch] trying SchemaStore for:", document.uri);
  const schemaStore = await resolveSchemaStoreSchema(document.uri);
  console.error("[resolveWithFetch] schemaStore result:", schemaStore);

  if (schemaStore) {
    return resolveSchema(document, jsonDoc);
  }

  return null;
}

// ── Completion ────────────────────────────────────────────────────────────────
connection.onCompletion(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const jsonDoc = getJSONDocument(document);
    const resolved = await resolveSchemaWithFetch(document, jsonDoc);
    if (!resolved) return [];
    return getCompletions(document, params.position, resolved.schema);
  } catch (err) {
    console.error("[completion] error:", err);
    return [];
  }
});

// ── Hover ─────────────────────────────────────────────────────────────────────
connection.onHover(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const jsonDoc = getJSONDocument(document);
    const resolved = await resolveSchemaWithFetch(document, jsonDoc);
    if (!resolved) return null;
    return getHover(document, params.position, resolved.schema);
  } catch (err) {
    console.error("[hover] error:", err);
    return null;
  }
});

// ── Code Actions ──────────────────────────────────────────────────────────────
connection.onCodeAction(async (params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    const jsonDoc = getJSONDocument(document);
    const resolved = await resolveSchemaWithFetch(document, jsonDoc);
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
const revalidatedUris = new Set<string>();

async function validateWithRetry(document: TextDocument): Promise<void> {
  await validateDocument(document);

  const jsonDoc = getJSONDocument(document);
  const root = jsonDoc.root;
  let schemaUri: string | undefined;

  if (root?.type === "object") {
    for (const prop of root.children ?? []) {
      const keyNode = prop.children?.[0];
      const valueNode = prop.children?.[1];

      if (
        keyNode?.value === "$schema" &&
        valueNode?.type === "string" &&
        typeof valueNode.value === "string"
      ) {
        schemaUri = valueNode.value;
        break;
      }
    }
  }

  // If no inline $schema, check SchemaStore
  if (!schemaUri) {
    const schemaStore = await resolveSchemaStoreSchema(document.uri);
    if (schemaStore) schemaUri = schemaStore.uri;
  }

  if (
    schemaUri &&
    (schemaUri.startsWith("http://") || schemaUri.startsWith("https://")) &&
    !revalidatedUris.has(schemaUri)
  ) {
    revalidatedUris.add(schemaUri);

    fetchSchema(schemaUri).then((schema) => {
      if (schema) {
        const doc = documents.get(document.uri);
        if (doc) {
          console.error(
            "[server] re-validating after schema fetch:",
            schemaUri,
          );
          validateDocument(doc);
        }
      }
    });
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
