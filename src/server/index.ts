import "@hyperjump/json-schema/draft-04";
import "@hyperjump/json-schema/draft-06";
import "@hyperjump/json-schema/draft-07";
import "@hyperjump/json-schema/draft-2019-09";
import "@hyperjump/json-schema/draft-2020-12";

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
import { getDocumentSymbols } from "../json/documentSymbols.js";
import { formatDocument, formatRange } from "../json/formatter.js";

// ── Register local schemas ────────────────────────────────────────────────────
const PERSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://example.com/schemas/person.schema.json",
  type: "object" as const,
  properties: {
    name: {
      type: "string",
      markdownDescription: "The person's **full name** — _first and last_",
      errorMessage: "Name must be a string",
    },
    age: {
      type: "number",
      description: "Age in years",
      errorMessage: "Age must be a number",
    },
    active: { type: "boolean", description: "Whether the account is active" },
    address: {
      $ref: "#/definitions/Address",
      defaultSnippets: [
        {
          label: "Full address",
          description: "Insert a complete address",
          body: {
            street: "$1",
            city: "$2",
            zip: "$3",
          },
        },
      ],
    },
  },
  required: ["name"],
  definitions: {
    Address: {
      type: "object",
      description: "Mailing address",
      defaultSnippets: [
        {
          label: "Full address",
          description: "Insert a complete address",
          body: {
            street: "$1",
            city: "$2",
            zip: "$3",
          },
        },
      ],
      properties: {
        street: { type: "string" },
        city: { type: "string" },
        zip: { type: "string" },
      },
      required: ["city"],
    },
  },
};

registerSchema({
  uri: "https://example.com/schemas/person.schema.json",
  schema: PERSON_SCHEMA,
  pattern: "**/*.person.json",
});

registerSchema({
  uri: "https://example.com/schemas/modern.schema.json",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      name: { type: "string", description: "Full name" },
    },
    required: ["name"],
  },
  pattern: "**/*.modern.json",
});

registerSchema({
  uri: "https://example.com/schemas/dynamic.schema.json",
  schema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.com/schemas/dynamic.schema.json",
    type: "object",
    properties: {
      items: { $dynamicRef: "#items" },
    },
    $defs: {
      items: {
        $dynamicAnchor: "items",
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "number" },
        },
        required: ["name"],
      },
    },
  },
  pattern: "**/*.dynamic.json",
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

connection.onDocumentSymbol((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return getDocumentSymbols(document);
  } catch (err) {
    console.error("[documentSymbol] error:", err);
    return [];
  }
});

connection.onDocumentFormatting((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return formatDocument(document, params.options);
  } catch (err) {
    console.error("[formatting] error:", err);
    return [];
  }
});

connection.onDocumentRangeFormatting((params) => {
  try {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];
    return formatRange(document, params.range, params.options);
  } catch (err) {
    console.error("[rangeFormatting] error:", err);
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
