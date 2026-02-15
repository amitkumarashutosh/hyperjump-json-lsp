import { TextDocument } from "vscode-languageserver-textdocument";
import { Position } from "vscode-languageserver/node";

export function positionToOffset(
  document: TextDocument,
  position: Position,
): number {
  return document.offsetAt(position);
}

export function offsetToPosition(
  document: TextDocument,
  offset: number,
): Position {
  return document.positionAt(offset);
}
