import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
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
    return getValueCompletions(path, schema);
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
  if (node.type === "string" && node.parent?.type === "property") {
    const keyNode = node.parent.children?.[0];
    if (keyNode === node) return "key";
    return "value";
  }

  if (node.type === "object") return "key";
  if (node.type === "property") return "key";

  if (node.parent?.type === "property") {
    const valueNode = node.parent.children?.[1];
    if (valueNode === node) return "value";
  }

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

  const properties = getSchemaProperties(subSchema);

  console.error(
    "[keyCompletions] properties from getSchemaProperties:",
    properties.slice(0, 5),
  );

  if (properties.length === 0) return [];

  const existingKeys = getExistingKeys(root, parentPath);

  // Remove the current node's value from existing keys
  // because it's the key being typed right now — not a completed key
  const currentValue = currentNode.value;
  if (typeof currentValue === "string") {
    existingKeys.delete(currentValue);
  }

  console.error("[keyCompletions] existingKeys:", [...existingKeys]);

  const filtered = properties.filter((prop) => !existingKeys.has(prop));
  console.error("[keyCompletions] filtered count:", filtered.length);

  // Replace from after opening quote to before closing quote
  const replaceRange = {
    start: document.positionAt(currentNode.offset + 1),
    end: document.positionAt(currentNode.offset + currentNode.length - 1),
  };

  return filtered.map((prop) => {
    const propSchema = getPropertySchema(subSchema, prop);
    const required = isRequired(subSchema, prop);
    const typeHint = getTypeHint(propSchema);
    const type = Array.isArray(propSchema?.type)
      ? propSchema?.type[0]
      : propSchema?.type;

    let valueSnippet: string;
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

    return {
      label: prop,
      kind: CompletionItemKind.Property,
      detail: typeHint,
      documentation: (propSchema?.description as string) ?? undefined,
      textEdit: {
        range: replaceRange,
        newText: `${prop}": ${valueSnippet}`,
      },
      insertTextFormat: InsertTextFormat.Snippet,
      filterText: prop,
      sortText: required ? `0_${prop}` : `1_${prop}`,
    };
  });
}

// ── Value Completions ────────────────────────────────────────────────────────

function getValueCompletions(
  path: string[],
  schema: RawSchema,
): CompletionItem[] {
  const subSchema = walkSchema(schema, path);
  if (!subSchema) return [];

  const items: CompletionItem[] = [];

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

function getPathToNode(node: JsonNode, root: JsonNode): string[] {
  const path: string[] = [];
  let current: JsonNode | undefined = node;

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
