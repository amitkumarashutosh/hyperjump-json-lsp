import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  Position,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Node as JsonNode } from "jsonc-parser";
import { getJSONDocument } from "./cache.js";
import { getNodeAtOffset } from "./parser.js";
import {
  walkSchema,
  getSchemaProperties,
  getPropertySchema,
  isRequired,
  getDefaultSnippets,
  getDescription,
  DefaultSnippet,
  RawSchema,
} from "./schemaWalker.js";

export function getCompletions(
  document: TextDocument,
  position: Position,
  schema: RawSchema,
): CompletionItem[] {
  const jsonDoc = getJSONDocument(document);

  console.error("[completion] parseErrors:", jsonDoc.parseErrors.length);
  console.error("[completion] root:", jsonDoc.root?.type);

  const offset = document.offsetAt(position);
  const root = jsonDoc.root;

  if (!root) {
    console.error("[completion] bailing — no root");
    return [];
  }

  const node = getNodeAtOffset(root, offset);
  console.error("[completion] offset:", offset);
  console.error("[completion] node type:", node?.type);
  console.error("[completion] node value:", node?.value);
  console.error("[completion] parent type:", node?.parent?.type);
  console.error(
    "[completion] context:",
    node ? getCompletionContext(node, offset, document) : "no node",
  );

  if (!node) {
    console.error("[completion] bailing — no node at offset");
    return [];
  }

  const path = getPathToNode(node, root);
  console.error("[completion] path:", JSON.stringify(path));

  const context = getCompletionContext(node, offset, document);
  console.error("[completion] context:", context);

  if (context === "key") {
    return getKeyCompletions(path, schema, root, document, node);
  }

  if (context === "value") {
    return getValueCompletions(path, schema, document, node);
  }

  console.error("[completion] context was none — no completions");
  return [];
}

// ── Context Detection ────────────────────────────────────────────────────────

type CompletionContext = "key" | "value" | "none";

function getCompletionContext(
  node: JsonNode,
  offset: number,
  document: TextDocument,
): CompletionContext {
  // String in key or value position
  if (node.type === "string" && node.parent?.type === "property") {
    const keyNode = node.parent.children?.[0];
    if (keyNode === node) return "key";
    return "value";
  }

  // Non-string value node in value position
  if (node.parent?.type === "property" && node.parent.children?.[1] === node) {
    return "value";
  }

  // Property node — check if cursor is past the colon (value position)
  if (node.type === "property") {
    const keyNode = node.children?.[0];
    const valueNode = node.children?.[1];

    if (keyNode && !valueNode) {
      // No value yet — cursor is after key, suggest value
      const keyEnd = keyNode.offset + keyNode.length;
      const text = document.getText();
      const slice = text.slice(keyEnd, offset);
      if (slice.includes(":")) return "value";
    }

    if (valueNode && offset >= valueNode.offset) {
      return "value";
    }

    return "key";
  }

  if (node.type === "object") return "key";

  return "none";
}

// ── Key Completions ──────────────────────────────────────────────────────────

function getKeyCompletions(
  path: string[],
  schema: RawSchema,
  root: JsonNode,
  document: TextDocument,
  currentNode: JsonNode,
): CompletionItem[] {
  const parentPath = path.slice(0, -1);
  const subSchema = walkSchema(schema, parentPath);

  console.error("[keyCompletions] parentPath:", JSON.stringify(parentPath));
  console.error("[keyCompletions] subSchema:", !!subSchema);
  console.error(
    "[keyCompletions] properties count:",
    Object.keys(subSchema?.properties ?? {}).length,
  );

  if (!subSchema) return [];

  const items: CompletionItem[] = [];

  // ── defaultSnippets at this level ────────────────────────────────────────
  const snippets = getDefaultSnippets(subSchema);
  for (const snippet of snippets) {
    const snippetText = bodyToSnippet(snippet.body);
    const description =
      snippet.markdownDescription ?? snippet.description ?? "";

    items.push({
      label: snippet.label ?? snippetText,
      kind: CompletionItemKind.Snippet,
      detail: "snippet",
      documentation: description,
      insertText: snippetText,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `0_snippet_${snippet.label ?? ""}`,
    });
  }

  // ── Regular property completions ─────────────────────────────────────────
  const properties = getSchemaProperties(subSchema);

  console.error(
    "[keyCompletions] properties from getSchemaProperties:",
    properties.slice(0, 5),
  );

  if (properties.length === 0 && items.length === 0) return [];

  const existingKeys = getExistingKeys(root, parentPath);

  const currentValue = currentNode.value;
  if (typeof currentValue === "string") {
    existingKeys.delete(currentValue);
  }

  console.error("[keyCompletions] existingKeys:", [...existingKeys]);

  const filtered = properties.filter((prop) => !existingKeys.has(prop));
  console.error("[keyCompletions] filtered count:", filtered.length);

  const replaceRange = {
    start: document.positionAt(currentNode.offset + 1),
    end: document.positionAt(currentNode.offset + currentNode.length - 1),
  };

  for (const prop of filtered) {
    const propSchema = getPropertySchema(subSchema, prop);
    const required = isRequired(subSchema, prop);
    const typeHint = getTypeHint(propSchema);
    const description = getDescription(propSchema ?? {});
    const type = Array.isArray(propSchema?.type)
      ? propSchema?.type[0]
      : propSchema?.type;

    // Check for defaultSnippets on the property schema
    const propSnippets = propSchema ? getDefaultSnippets(propSchema) : [];
    let valueSnippet: string;

    if (propSnippets.length > 0 && propSnippets[0]) {
      // Use first defaultSnippet as the value
      valueSnippet = bodyToSnippet(propSnippets[0].body);
    } else {
      switch (type) {
        case "string":
          valueSnippet = `"$1"`;
          break;
        case "number":
        case "integer":
          valueSnippet = `\${1:0}`;
          break;
        case "boolean":
          valueSnippet = `\${1|true,false|}`;
          break;
        case "object":
          valueSnippet = `{\n\t$1\n}`;
          break;
        case "array":
          valueSnippet = `[$1]`;
          break;
        case "null":
          valueSnippet = `null`;
          break;
        default:
          valueSnippet = `$1`;
      }
    }

    items.push({
      label: prop,
      kind: CompletionItemKind.Property,
      detail: typeHint,
      ...(description !== undefined && {
        documentation: {
          kind: MarkupKind.Markdown,
          value: description,
        },
      }),
      textEdit: {
        range: replaceRange,
        newText: `${prop}": ${valueSnippet}`,
      },
      insertTextFormat: InsertTextFormat.Snippet,
      filterText: prop,
      sortText: required ? `0_${prop}` : `1_${prop}`,
    });
  }

  return items;
}

// ── Value Completions ────────────────────────────────────────────────────────

function getValueCompletions(
  path: string[],
  schema: RawSchema,
  document: TextDocument,
  currentNode: JsonNode,
): CompletionItem[] {
  const subSchema = walkSchema(schema, path);
  if (!subSchema) return [];

  const items: CompletionItem[] = [];

  // ── defaultSnippets on the value schema ──────────────────────────────────
  const snippets = getDefaultSnippets(subSchema);
  for (const snippet of snippets) {
    const snippetText = bodyToSnippet(snippet.body);
    const description =
      snippet.markdownDescription ?? snippet.description ?? "";

    items.push({
      label: snippet.label ?? snippetText,
      kind: CompletionItemKind.Snippet,
      documentation: description,
      insertText: snippetText,
      insertTextFormat: InsertTextFormat.Snippet,
      sortText: `0_snippet_${snippet.label ?? ""}`,
    });
  }

  // ── Enum values ───────────────────────────────────────────────────────────
  if (subSchema.enum) {
    for (const value of subSchema.enum) {
      items.push({
        label: JSON.stringify(value),
        kind: CompletionItemKind.EnumMember,
        insertText: JSON.stringify(value),
        insertTextFormat: InsertTextFormat.PlainText,
      });
    }
    return items;
  }

  // ── Type-based suggestions ────────────────────────────────────────────────
  const types = Array.isArray(subSchema.type)
    ? subSchema.type
    : subSchema.type
      ? [subSchema.type]
      : [];

  for (const type of types) {
    switch (type) {
      case "boolean":
        items.push(makeLiteral("true", CompletionItemKind.Value));
        items.push(makeLiteral("false", CompletionItemKind.Value));
        break;
      case "null":
        items.push(makeLiteral("null", CompletionItemKind.Value));
        break;
      case "string":
        items.push({
          label: '""',
          kind: CompletionItemKind.Value,
          insertText: '"$1"',
          insertTextFormat: InsertTextFormat.Snippet,
        });
        break;
      case "number":
      case "integer":
        items.push({
          label: "0",
          kind: CompletionItemKind.Value,
          insertText: "${1:0}",
          insertTextFormat: InsertTextFormat.Snippet,
        });
        break;
      case "object":
        items.push({
          label: "{}",
          kind: CompletionItemKind.Value,
          insertText: "{$1}",
          insertTextFormat: InsertTextFormat.Snippet,
        });
        break;
      case "array":
        items.push({
          label: "[]",
          kind: CompletionItemKind.Value,
          insertText: "[$1]",
          insertTextFormat: InsertTextFormat.Snippet,
        });
        break;
    }
  }

  return items;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a defaultSnippet body to a VSCode snippet string.
 * Handles nested objects/arrays recursively.
 */
function bodyToSnippet(body: unknown, indent = ""): string {
  if (body === null) return "null";
  if (typeof body === "boolean") return String(body);
  if (typeof body === "number") return String(body);
  if (typeof body === "string") {
    // Already a snippet string — pass through
    return body;
  }

  if (Array.isArray(body)) {
    if (body.length === 0) return "[]";
    const innerIndent = indent + "\t";
    const items = body
      .map((item) => `${innerIndent}${bodyToSnippet(item, innerIndent)}`)
      .join(",\n");
    return `[\n${items}\n${indent}]`;
  }

  if (typeof body === "object") {
    const entries = Object.entries(body as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const innerIndent = indent + "\t";
    const props = entries
      .map(([k, v]) => `${innerIndent}"${k}": ${bodyToSnippet(v, innerIndent)}`)
      .join(",\n");
    return `{\n${props}\n${indent}}`;
  }

  return String(body);
}

function getPathToNode(node: JsonNode, root: JsonNode): string[] {
  const path: string[] = [];
  let current: JsonNode | undefined = node;

  // If we're on a property node itself, include its key in the path
  if (current.type === "property") {
    const keyNode = current.children?.[0];
    if (keyNode?.value !== undefined) {
      path.unshift(String(keyNode.value));
    }
    current = current.parent;
  }

  while (current && current !== root) {
    const parent: any = current.parent;
    if (!parent) break;

    if (parent.type === "property") {
      const keyNode = parent.children?.[0];
      if (keyNode?.value !== undefined) {
        path.unshift(String(keyNode.value));
      }
      current = parent.parent;
    } else if (parent.type === "array") {
      const index = parent.children?.indexOf(current) ?? -1;
      if (index >= 0) path.unshift(String(index));
      current = parent;
    } else {
      current = parent;
    }
  }

  return path;
}

function getExistingKeys(root: JsonNode, path: string[]): Set<string> {
  const keys = new Set<string>();
  let current: JsonNode | undefined = root;

  for (const segment of path) {
    if (!current) return keys;
    if (current.type === "object") {
      const prop: any = current.children?.find(
        (p) => p.children?.[0]?.value === segment,
      );
      current = prop?.children?.[1];
    } else if (current.type === "array") {
      current = current.children?.[parseInt(segment, 10)];
    }
  }

  if (current?.type === "object") {
    for (const prop of current.children ?? []) {
      const key = prop.children?.[0]?.value;
      if (typeof key === "string") keys.add(key);
    }
  }

  return keys;
}

function getTypeHint(schema: RawSchema | undefined): string {
  if (!schema) return "";
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return schema.type ?? "";
}

function makeLiteral(label: string, kind: CompletionItemKind): CompletionItem {
  return {
    label,
    kind,
    insertText: label,
    insertTextFormat: InsertTextFormat.PlainText,
  };
}
