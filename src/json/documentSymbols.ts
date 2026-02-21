import {
  DocumentSymbol,
  SymbolKind,
  Range,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Node as JsonNode } from "jsonc-parser";
import { getJSONDocument } from "./cache.js";

export function getDocumentSymbols(document: TextDocument): DocumentSymbol[] {
  const jsonDoc = getJSONDocument(document);
  const root = jsonDoc.root;

  if (!root) return [];

  return getSymbolsForNode(root, document);
}

function getSymbolsForNode(
  node: JsonNode,
  document: TextDocument,
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  if (node.type === "object") {
    for (const prop of node.children ?? []) {
      const symbol = getSymbolForProperty(prop, document);
      if (symbol) symbols.push(symbol);
    }
  } else if (node.type === "array") {
    node.children?.forEach((child, index) => {
      const symbol = getSymbolForArrayItem(child, index, document);
      if (symbol) symbols.push(symbol);
    });
  }

  return symbols;
}

function getSymbolForProperty(
  prop: JsonNode,
  document: TextDocument,
): DocumentSymbol | null {
  const keyNode = prop.children?.[0];
  const valueNode = prop.children?.[1];

  if (!keyNode || !valueNode) return null;

  const name = String(keyNode.value);
  const kind = getSymbolKind(valueNode);
  const range = nodeToRange(prop, document);
  const selectionRange = nodeToRange(keyNode, document);
  const children = getSymbolsForNode(valueNode, document);
  const detail = getDetail(valueNode);

  // Use exactOptionalPropertyTypes-safe construction
  const symbol: DocumentSymbol = {
    name,
    kind,
    range,
    selectionRange,
    detail,
  };

  if (children.length > 0) {
    symbol.children = children;
  }

  return symbol;
}

function getSymbolForArrayItem(
  node: JsonNode,
  index: number,
  document: TextDocument,
): DocumentSymbol | null {
  const kind = getSymbolKind(node);
  const range = nodeToRange(node, document);
  const children = getSymbolsForNode(node, document);
  const detail = getDetail(node);

  const symbol: DocumentSymbol = {
    name: `[${index}]`,
    kind,
    range,
    selectionRange: range,
    detail,
  };

  if (children.length > 0) {
    symbol.children = children;
  }

  return symbol;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getSymbolKind(node: JsonNode): SymbolKind {
  switch (node.type) {
    case "object":
      return SymbolKind.Module;
    case "array":
      return SymbolKind.Array;
    case "string":
      return SymbolKind.String;
    case "number":
      return SymbolKind.Number;
    case "boolean":
      return SymbolKind.Boolean;
    case "null":
      return SymbolKind.Null;
    default:
      return SymbolKind.Variable;
  }
}

function getDetail(node: JsonNode): string {
  switch (node.type) {
    case "string":
      return `"${String(node.value)}"`;
    case "number":
    case "boolean":
    case "null":
      return String(node.value);
    case "object": {
      const count = (node.children ?? []).length;
      return `{${count} ${count === 1 ? "property" : "properties"}}`;
    }
    case "array": {
      const count = (node.children ?? []).length;
      return `[${count} ${count === 1 ? "item" : "items"}]`;
    }
    default:
      return "";
  }
}

function nodeToRange(node: JsonNode, document: TextDocument): Range {
  return {
    start: document.positionAt(node.offset),
    end: document.positionAt(node.offset + node.length),
  };
}
