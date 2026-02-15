import { connection } from "./connection";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import { getJSONDocument } from "../json/cache";
import { formatParseError } from "../json/parser";
import { normalizeErrors } from "../json/errors";

export function validateDocument(document: TextDocument): void {
  const jsonDoc = getJSONDocument(document);

  const diagnostics: Diagnostic[] = [];

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

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}
