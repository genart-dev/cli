/**
 * genart agent stdio — MCP server over stdio transport.
 * Replaces the standalone genart-mcp binary.
 */

import { Command } from "commander";

export const stdioCommand = new Command("stdio")
  .description("Start MCP server over stdio transport")
  .option("--base-path <dir>", "Base directory for file operations", process.cwd())
  .action(async (opts) => {
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

    console.error("[genart] MCP server connected (stdio)");
  });
