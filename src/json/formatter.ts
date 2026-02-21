import { TextEdit, Range, Position } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FormattingOptions } from "vscode-languageserver/node.js";

export function formatDocument(
  document: TextDocument,
  options: FormattingOptions,
): TextEdit[] {
  const text = document.getText();

  // Parse and re-serialize with correct formatting
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Document has syntax errors — don't format
    return [];
  }

  const indent = options.insertSpaces ? " ".repeat(options.tabSize) : "\t";

  const formatted = JSON.stringify(parsed, null, indent) + "\n";

  // If already formatted, return no edits
  if (formatted === text) return [];

  // Replace entire document
  const start: Position = { line: 0, character: 0 };
  const end = document.positionAt(text.length);

  const range: Range = { start, end };

  return [
    {
      range,
      newText: formatted,
    },
  ];
}

/**
 * Format a specific range within the document.
 * For simplicity we format the whole document and return
 * only the edit that affects the requested range.
 */
export function formatRange(
  document: TextDocument,
  range: Range,
  options: FormattingOptions,
): TextEdit[] {
  // For JSON, range formatting is complex — format whole document
  // This is the same approach vscode-json-languageservice takes
  return formatDocument(document, options);
}
