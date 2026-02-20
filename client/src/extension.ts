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

  // Entry is now src/server/index.ts → dist/server/index.js
  const serverModule = path.join(workspaceRoot, "dist", "server", "index.js");

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
    documentSelector: [
      { scheme: "file", language: "json", pattern: "**/*.json" },
      { scheme: "file", language: "jsonc" },
    ],
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
