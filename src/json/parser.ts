import {
  parseTree,
  findNodeAtOffset,
  Node as JsonNode,
  ParseError,
  printParseErrorCode,
} from "jsonc-parser";

export interface ParsedJson {
  root: JsonNode | undefined;
  errors: ParseError[];
}

export function parseJson(text: string): ParsedJson {
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, {
    allowTrailingComma: false,
    disallowComments: true,
  });

  return { root, errors };
}

export function getNodeAtOffset(root: JsonNode | undefined, offset: number) {
  if (!root) return undefined;
  return findNodeAtOffset(root, offset);
}

export function formatParseError(error: ParseError): string {
  return printParseErrorCode(error.error);
}
