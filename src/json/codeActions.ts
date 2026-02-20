import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Node as JsonNode } from "jsonc-parser";
import { getJSONDocument } from "./cache.js";
import { resolveJsonPointer } from "./instancePath.js";
import { walkSchema, getSchemaProperties, RawSchema } from "./schemaWalker.js";

export function getCodeActions(
  document: TextDocument,
  diagnostics: Diagnostic[],
  schema: RawSchema,
): CodeAction[] {
  const actions: CodeAction[] = [];
  const jsonDoc = getJSONDocument(document);
  const root = jsonDoc.root;

  if (!root) return actions;

  for (const diagnostic of diagnostics) {
    if (diagnostic.source !== "hyperjump-json-lsp") continue;

    const message = diagnostic.message;

    // ── Missing required property ──────────────────────────────────────────
    if (message.startsWith("Missing required property")) {
      const fixes = buildMissingPropertyFixes(
        document,
        diagnostic,
        root,
        schema,
      );
      actions.push(...fixes);
    }

    // ── Incorrect type ─────────────────────────────────────────────────────
    if (message.startsWith("Incorrect type")) {
      const fixes = buildTypeFixes(document, diagnostic, root, schema);
      actions.push(...fixes);
    }
  }

  return actions;
}

// ── Missing Required Property Fix ───────────────────────────────────────────

function buildMissingPropertyFixes(
  document: TextDocument,
  diagnostic: Diagnostic,
  root: JsonNode,
  schema: RawSchema,
): CodeAction[] {
  const actions: CodeAction[] = [];

  const instancePath = extractInstancePath(diagnostic.message);
  const parentSchema = walkSchema(schema, instancePath);

  if (!parentSchema?.required || !parentSchema?.properties) return actions;

  const objectNode =
    instancePath.length === 0
      ? root
      : resolveJsonPointer(root, "/" + instancePath.join("/"));

  if (!objectNode || objectNode.type !== "object") return actions;

  const existingKeys = new Set(
    (objectNode.children ?? [])
      .map((p) => p.children?.[0]?.value)
      .filter((k) => typeof k === "string"),
  );

  for (const required of parentSchema.required) {
    if (existingKeys.has(required)) continue;

    const propSchema = parentSchema.properties[required] as
      | RawSchema
      | undefined;
    const defaultValue = getDefaultValueSnippet(propSchema);

    const text = document.getText();
    const hasChildren = (objectNode.children ?? []).length > 0;

    // Detect indentation from existing content
    const indent = detectIndent(text, objectNode);

    let newText: string;
    let insertOffset: number;

    if (hasChildren) {
      // Insert after the last property, before closing brace
      const lastChild = objectNode.children![objectNode.children!.length - 1]!;
      insertOffset = lastChild.offset + lastChild.length;
      newText = `,\n${indent}"${required}": ${defaultValue}`;
    } else {
      // Empty object — insert before closing brace
      insertOffset = findClosingBrace(text, objectNode);
      newText = `\n${indent}"${required}": ${defaultValue}\n`;
    }

    const insertPosition = document.positionAt(insertOffset);

    const edit: TextEdit = {
      range: {
        start: insertPosition,
        end: insertPosition,
      },
      newText,
    };

    actions.push({
      title: `Add missing property "${required}"`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: {
        changes: { [document.uri]: [edit] },
      },
    });
  }

  return actions;
}

// ── Incorrect Type Fix ───────────────────────────────────────────────────────

function buildTypeFixes(
  document: TextDocument,
  diagnostic: Diagnostic,
  root: JsonNode,
  schema: RawSchema,
): CodeAction[] {
  const actions: CodeAction[] = [];

  const offset = document.offsetAt(diagnostic.range.start);
  const node = findNodeAtOffset(root, offset);

  if (!node) return actions;

  const path = getPathToNode(node, root);
  const nodeSchema = walkSchema(schema, path);

  if (!nodeSchema?.type) return actions;

  const expectedType = Array.isArray(nodeSchema.type)
    ? nodeSchema.type[0]
    : nodeSchema.type;

  const currentValue = node.value;

  const converted = tryConvert(currentValue, expectedType as any);
  if (converted === null) return actions;

  const edit: TextEdit = {
    range: diagnostic.range,
    newText: converted,
  };

  actions.push({
    title: `Convert to ${expectedType}`,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: {
      changes: {
        [document.uri]: [edit],
      },
    },
  });

  return actions;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the instance path segments from a diagnostic message.
 * e.g. 'Missing required property at "/address"' → ["address"]
 * e.g. 'Missing required property at root' → []
 */
function extractInstancePath(message: string): string[] {
  const match = message.match(/at "(.+)"$/);
  if (!match || !match[1]) return [];
  return match[1].split("/").filter(Boolean);
}

/**
 * Get a sensible default value string for a schema type.
 */
function getDefaultValueSnippet(schema: RawSchema | undefined): string {
  if (!schema) return '""';
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case "string":
      return '""';
    case "number":
    case "integer":
      return "0";
    case "boolean":
      return "true";
    case "array":
      return "[]";
    case "object":
      return "{}";
    case "null":
      return "null";
    default:
      return '""';
  }
}

/**
 * Detect the indentation used inside an object by looking at existing
 * properties or the object's position in the document.
 */
function detectIndent(text: string, objectNode: JsonNode): string {
  const firstChild = objectNode.children?.[0];
  if (firstChild) {
    const slice = text.slice(objectNode.offset, firstChild.offset);
    const match = slice.match(/\n(\s+)$/);
    if (match) return match[1] ?? "  ";
  }
  return "  "; // default 2 spaces
}

/**
 * Find the offset of the closing brace of an object node.
 */
function findClosingBrace(text: string, objectNode: JsonNode): number {
  let offset = objectNode.offset + objectNode.length - 1;
  while (offset > objectNode.offset && text[offset] !== "}") {
    offset--;
  }
  return offset;
}

/**
 * Try to convert a value to a target type.
 * Returns the new text or null if conversion is not possible.
 */
function tryConvert(value: unknown, targetType: string): string | null {
  switch (targetType) {
    case "string":
      return `"${String(value)}"`;
    case "number": {
      const n = Number(value);
      return isNaN(n) ? null : String(n);
    }
    case "boolean":
      return value ? "true" : "false";
    case "null":
      return "null";
    default:
      return null;
  }
}

/**
 * Find a JSON node at a given offset by walking the AST.
 */
function findNodeAtOffset(
  root: JsonNode,
  offset: number,
): JsonNode | undefined {
  if (offset < root.offset || offset > root.offset + root.length) {
    return undefined;
  }

  for (const child of root.children ?? []) {
    const found = findNodeAtOffset(child, offset);
    if (found) return found;
  }

  return root;
}

/**
 * Get the path from root to a node.
 */
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
