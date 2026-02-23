/**
 * genart agent sidecar — MCP server over stdio with IPC mutation forwarding.
 * Used by the Electron desktop app to receive real-time mutation notifications.
 */

import { Command } from "commander";

export const sidecarCommand = new Command("sidecar")
  .description("Start MCP server in sidecar mode (stdio + IPC mutations)")
  .option("--base-path <dir>", "Base directory for file operations", process.cwd())
  .action(async (opts) => {
    // Set sidecar env BEFORE importing mcp-server (isSidecarMode() checks this)
    process.env["GENART_SIDECAR"] = "1";

    const { EditorState, createServer } = await import("@genart-dev/mcp-server/lib");
    const { StdioServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/stdio.js"
    );

    const state = new EditorState();
    if (opts.basePath) {
      state.basePath = opts.basePath as string;
    }

    const server = createServer(state);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("[genart] MCP server connected (sidecar)");
  });
