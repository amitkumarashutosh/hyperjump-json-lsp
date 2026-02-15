import { connection } from "./connection";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";

export function validateDocument(document: TextDocument): void {
  const text = document.getText();

  const diagnostics: Diagnostic[] = [];

  // Stub rule (proves validation pipeline works)
  if (text.includes("INVALID_TOKEN")) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.positionAt(text.indexOf("INVALID_TOKEN")),
        end: document.positionAt(text.indexOf("INVALID_TOKEN") + 13),
      },
      message: "Found INVALID_TOKEN (stub validation)",
      source: "hyperjump-json-lsp",
    });
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}
