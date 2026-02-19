import { TextDocuments } from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";

export const documents = new TextDocuments(TextDocument);
