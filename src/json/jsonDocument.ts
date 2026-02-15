import { TextDocument } from "vscode-languageserver-textdocument";
import { Node as JsonNode } from "jsonc-parser";
import { parseJson, ParsedJson } from "./parser";

export class JSONDocument {
  readonly uri: string;
  readonly textDocument: TextDocument;

  private parsed: ParsedJson;

  constructor(doc: TextDocument) {
    this.uri = doc.uri;
    this.textDocument = doc;
    this.parsed = parseJson(doc.getText());
  }

  get root(): JsonNode | undefined {
    return this.parsed.root;
  }

  get parseErrors() {
    return this.parsed.errors;
  }

  update(doc: TextDocument) {
    this.parsed = parseJson(doc.getText());
  }
}
