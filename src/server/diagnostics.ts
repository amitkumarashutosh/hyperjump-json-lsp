import { connection } from "./connection.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import { getJSONDocument } from "../json/cache.js";
import { normalizeErrors } from "../json/errors.js";
import { validateInstance } from "../json/schemaValidator.js";
import { resolveJsonPointer } from "../json/instancePath.js";
import { resolveSchema } from "../json/schemaResolver.js";
import { walkSchema, getErrorMessage } from "../json/schemaWalker.js";

export async function validateDocument(document: TextDocument): Promise<void> {
  const jsonDoc = getJSONDocument(document);
  const diagnostics: Diagnostic[] = [];

  // ── 1. Syntax errors ─────────────────────────────────────────────────────
  const normalized = normalizeErrors(jsonDoc.parseErrors);

  for (const err of normalized) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(err.offset),
        end: document.positionAt(err.offset + err.length),
      },
      message: err.message,
      source: "hyperjump-json-lsp",
    });
  }

  // ── 2. Schema validation ──────────────────────────────────────────────────
  if (normalized.length === 0 && jsonDoc.root) {
    const resolved = resolveSchema(document, jsonDoc);

    if (resolved) {
      const instance = astToValue(jsonDoc.root);
      const result = await validateInstance(
        resolved.uri,
        instance,
        resolved.schema,
      );

      for (const error of result.errors) {
        const node = resolveJsonPointer(jsonDoc.root, error.instancePath);

        const start = node
          ? document.positionAt(node.offset)
          : { line: 0, character: 0 };
        const end = node
          ? document.positionAt(node.offset + node.length)
          : { line: 0, character: 0 };

        // ── Custom errorMessage support ─────────────────────────────────
        // Check if the schema at this path has a custom errorMessage
        const pathSegments = error.instancePath.split("/").filter(Boolean);

        const propSchema =
          pathSegments.length > 0
            ? walkSchema(resolved.schema, pathSegments)
            : undefined;

        const customMessage = propSchema
          ? getErrorMessage(propSchema, error.keyword)
          : undefined;

        const message = customMessage ?? error.message;

        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: { start, end },
          message,
          source: "hyperjump-json-lsp",
        });
      }
    }
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

function astToValue(node: import("jsonc-parser").Node): unknown {
  switch (node.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const prop of node.children ?? []) {
        const key = prop.children?.[0]?.value as string;
        const val = prop.children?.[1];
        if (key !== undefined && val !== undefined) {
          obj[key] = astToValue(val);
        }
      }
      return obj;
    }
    case "array":
      return (node.children ?? []).map(astToValue);
    case "string":
    case "number":
    case "boolean":
    case "null":
      return node.value;
    default:
      return null;
  }
}
