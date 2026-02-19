import { connection } from "./connection.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node.js";
import { getJSONDocument } from "../json/cache.js";
import { normalizeErrors } from "../json/errors.js";
import { validateInstance } from "../json/schemaValidator.js";
import { resolveJsonPointer } from "../json/instancePath.js";
import { DEFAULT_SCHEMA_URI } from "../json/schemaRegistry.js";

export async function validateDocument(document: TextDocument): Promise<void> {
  const jsonDoc = getJSONDocument(document);
  const diagnostics: Diagnostic[] = [];

  // ── 1. Syntax errors ────────────────────────────────────────────────────
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

  // ── 2. Schema validation (only if document parsed cleanly) ───────────────
  if (normalized.length === 0 && jsonDoc.root) {
    // Convert AST back to a plain JS value for Hyperjump
    const instance = astToValue(jsonDoc.root);

    const result = await validateInstance(DEFAULT_SCHEMA_URI, instance);

    for (const error of result.errors) {
      // Map JSON Pointer → AST node → offset → LSP Range
      const node = resolveJsonPointer(jsonDoc.root, error.instancePath);

      const start = node ? document.positionAt(node.offset) : { line: 0, character: 0 };
      const end = node
        ? document.positionAt(node.offset + node.length)
        : { line: 0, character: 0 };

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: { start, end },
        message: error.message,
        source: "hyperjump-json-lsp",
      });
    }
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

/**
 * Convert a jsonc-parser AST node into a plain JavaScript value.
 * This is what Hyperjump's validator actually receives.
 */
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