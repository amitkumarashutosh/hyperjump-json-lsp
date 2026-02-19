import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js";

export const connection = createConnection(ProposedFeatures.all);

export function handleInitialize(params: InitializeParams): InitializeResult {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // diagnosticProvider: {
      //   interFileDependencies: false,
      //   workspaceDiagnostics: false,
      // },
    },
  };
}
