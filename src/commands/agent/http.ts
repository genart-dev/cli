/**
 * genart agent http — MCP server over local HTTP with StreamableHTTP transport.
 * Allows multiple clients to connect to a persistent local server.
 */

import { Command } from "commander";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import chalk from "chalk";

export const httpCommand = new Command("http")
  .description("Start MCP server over HTTP (StreamableHTTP transport)")
  .option("--port <n>", "Port to listen on", Number, 3333)
  .option("--host <addr>", "Host to bind to", "127.0.0.1")
  .option("--base-path <dir>", "Base directory for file operations", process.cwd())
  .option("--cors", "Enable CORS headers for browser access")
  .action(async (opts) => {
    const { EditorState, createServer } = await import("@genart-dev/mcp-server/lib");
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );

    const port = opts.port as number;
    const host = opts.host as string;
    const enableCors = opts.cors as boolean | undefined;

    const state = new EditorState();
    if (opts.basePath) {
      state.basePath = opts.basePath as string;
    }

    const mcpServer = createServer(state);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => "local",
    });

    await mcpServer.connect(transport);

    const httpServer = createHttpServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        // CORS headers
        if (enableCors) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Mcp-Session-Id",
          );
          res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
        }

        if (req.method === "OPTIONS") {
          res.writeHead(enableCors ? 204 : 405);
          res.end();
          return;
        }

        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        if (req.url === "/mcp") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", async () => {
            const raw = Buffer.concat(chunks).toString();
            const body = raw ? JSON.parse(raw) : undefined;
            try {
              await transport.handleRequest(req, res, body);
            } catch (err) {
              console.error("[genart] handleRequest error:", err);
              if (!res.writableEnded) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: "Internal server error" }));
              }
            }
          });
          return;
        }

        res.writeHead(404);
        res.end();
      },
    );

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          chalk.red(`Port ${port} is already in use.`) +
            "\n" +
            chalk.dim(`Try: genart agent http --port ${port + 1}`),
        );
        process.exitCode = 1;
      } else {
        console.error(chalk.red(`Server error: ${err.message}`));
        process.exitCode = 1;
      }
    });

    httpServer.listen(port, host, () => {
      console.log(
        chalk.green(`MCP server listening on http://${host}:${port}/mcp`),
      );
      if (enableCors) {
        console.log(chalk.dim("CORS enabled"));
      }
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log(chalk.dim("\nShutting down..."));
      httpServer.close();
      try {
        await mcpServer.close();
      } catch {
        // Ignore close errors
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
