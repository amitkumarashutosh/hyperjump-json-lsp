import { Hover, MarkupKind } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Position } from "vscode-languageserver/node.js";
import { Node as JsonNode } from "jsonc-parser";
import { getJSONDocument } from "./cache.js";
import { getNodeAtOffset } from "./parser.js";
import {
  walkSchema,
  getPropertySchema,
  isRequired,
  RawSchema,
} from "./schemaWalker.js";

export function getHover(
  document: TextDocument,
  position: Position,
  schema: RawSchema,
): Hover | null {
  const jsonDoc = getJSONDocument(document);
  const root = jsonDoc.root;
  if (!root) return null;

  const offset = document.offsetAt(position);
  const node = getNodeAtOffset(root, offset);
  if (!node) return null;

  // Get the path to this node
  const path = getPathToNode(node, root);
  if (path.length === 0) return null;

  // Determine if we are hovering over a key or a value
  const isKey =
    node.type === "string" &&
    node.parent?.type === "property" &&
    node.parent.children?.[0] === node;

  // For key hover: show info about the property itself
  // For value hover: show info about the value's schema
  const schemaPath = isKey ? path : path;

  // Walk to the parent schema to get property metadata
  const parentPath = path.slice(0, -1);
  const propertyName = path[path.length - 1];

  if (!propertyName) return null;

  const parentSchema = walkSchema(schema, parentPath);
  if (!parentSchema) return null;

  const propSchema = getPropertySchema(parentSchema, propertyName);
  if (!propSchema) return null;

  const required = isRequired(parentSchema, propertyName);

  // Build the hover markdown
  const content = buildHoverContent(propertyName, propSchema, required);

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: content,
    },
    range: {
      start: document.positionAt(node.offset),
      end: document.positionAt(node.offset + node.length),
    },
  };
}

// ── Markdown Builder ─────────────────────────────────────────────────────────

function buildHoverContent(
  name: string,
  schema: RawSchema,
  required: boolean,
): string {
  const lines: string[] = [];

  // Header: property name + type + required badge
  const type = getTypeDisplay(schema);
  const requiredBadge = required ? " _(required)_" : " _(optional)_";
  lines.push(`**${name}** \`${type}\`${requiredBadge}`);
  lines.push("");

  // Description
  if (schema.description && typeof schema.description === "string") {
    lines.push(schema.description);
    lines.push("");
  }

  // Enum values
  if (schema.enum && Array.isArray(schema.enum)) {
    lines.push("**Allowed values:**");
    for (const val of schema.enum) {
      lines.push(`- \`${JSON.stringify(val)}\``);
    }
    lines.push("");
  }

  // Default value
  if (schema.default !== undefined) {
    lines.push(`**Default:** \`${JSON.stringify(schema.default)}\``);
    lines.push("");
  }

  // Min/max for numbers
  if (schema.minimum !== undefined) {
    lines.push(`**Minimum:** \`${schema.minimum}\``);
  }
  if (schema.maximum !== undefined) {
    lines.push(`**Maximum:** \`${schema.maximum}\``);
  }
  if (schema.minLength !== undefined) {
    lines.push(`**Min length:** \`${schema.minLength}\``);
  }
  if (schema.maxLength !== undefined) {
    lines.push(`**Max length:** \`${schema.maxLength}\``);
  }
  if (schema.pattern !== undefined) {
    lines.push(`**Pattern:** \`${schema.pattern}\``);
  }

  return lines.join("\n");
}

function getTypeDisplay(schema: RawSchema): string {
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  if (schema.type) return schema.type;
  if (schema.enum) return "enum";
  if (schema.properties) return "object";
  return "any";
}

// ── Path Helper (same logic as completion.ts) ────────────────────────────────

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
