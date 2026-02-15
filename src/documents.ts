import { TextDocuments } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

export const documents = new TextDocuments(TextDocument);
