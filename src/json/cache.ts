import { TextDocument } from "vscode-languageserver-textdocument";
import { JSONDocument } from "./jsonDocument";

const cache = new Map<string, JSONDocument>();

export function getJSONDocument(doc: TextDocument): JSONDocument {
  const existing = cache.get(doc.uri);

  if (existing) {
    existing.update(doc);
    return existing;
  }

  const created = new JSONDocument(doc);
  cache.set(doc.uri, created);
  return created;
}

export function removeJSONDocument(uri: string) {
  cache.delete(uri);
}
