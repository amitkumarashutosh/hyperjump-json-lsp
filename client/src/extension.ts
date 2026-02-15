import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  // Absolute path to workspace root (one level above client)
  const workspaceRoot = path.resolve(context.extensionPath, "..");

  // Since your entry file is src/index.ts → dist/index.js
  const serverModule = path.join(workspaceRoot, "dist", "index.js");

  console.log("Starting Hyperjump LSP from:", serverModule);

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "json" }],
  };

  client = new LanguageClient(
    "hyperjumpJsonServer",
    "Hyperjump JSON Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
