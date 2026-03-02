/**
 * genart dev <dir> — Watch project, compile on change, serve live preview.
 *
 * Starts a lightweight HTTP server that serves the sketch as standalone HTML
 * generated via `adapter.generateStandaloneHTML()`. A WebSocket connection
 * signals the browser to reload when recompilation succeeds.
 */

import { Command } from "commander";
import { resolve } from "node:path";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import chalk from "chalk";
import ora from "ora";
import {
  compileProject,
  watchProject,
  createDefaultRegistry,
  CompileFailure,
  type CompileResult,
  type CompileError,
  type SketchDefinition,
} from "@genart-dev/core";

/** Minimal WebSocket upgrade + frame implementation for hot-reload signaling. */
import { createHash } from "node:crypto";

/** Format a compile error for terminal display. */
function formatError(error: CompileError): string {
  const loc = error.line
    ? `:${error.line}${error.column ? `:${error.column}` : ""}`
    : "";
  return `${error.file}${loc}: ${error.message}`;
}

/** Generate the preview HTML with injected WebSocket reload script. */
function generatePreviewHtml(sketch: SketchDefinition, wsPort: number): string {
  const registry = createDefaultRegistry();
  const adapter = registry.resolve(sketch.renderer.type);
  const standaloneHtml = adapter.generateStandaloneHTML(sketch);

  // Inject a WebSocket reload script before </body>
  const reloadScript = `
<script>
(function() {
  var ws;
  function connect() {
    ws = new WebSocket('ws://localhost:${wsPort}');
    ws.onmessage = function(e) {
      if (e.data === 'reload') {
        window.location.reload();
      }
    };
    ws.onclose = function() {
      setTimeout(connect, 1000);
    };
  }
  connect();
})();
</script>`;

  // Insert before </body> or at the end
  if (standaloneHtml.includes("</body>")) {
    return standaloneHtml.replace("</body>", reloadScript + "\n</body>");
  }
  return standaloneHtml + reloadScript;
}

/** Accept a WebSocket upgrade and return a send function. */
function acceptWebSocket(
  req: IncomingMessage,
  socket: import("node:stream").Duplex,
): ((data: string) => void) | null {
  const key = req.headers["sec-websocket-key"];
  if (!key) return null;

  const accept = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-5AB5DC085B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
  );

  return (data: string) => {
    const payload = Buffer.from(data, "utf-8");
    const frame = Buffer.alloc(2 + payload.length);
    frame[0] = 0x81; // text frame, FIN
    frame[1] = payload.length; // no mask, length < 126
    payload.copy(frame, 2);
    socket.write(frame);
  };
}

export const devCommand = new Command("dev")
  .description("Watch project, compile on change, and serve live preview")
  .argument("<dir>", "Path to the project directory")
  .option("-p, --port <n>", "Preview server port", Number, 3456)
  .option("--open", "Open browser automatically")
  .option("-o, --output <path>", "Output .genart file path")
  .option("--no-preserve-state", "Do not carry forward state from existing .genart")
  .option("--no-preserve-layers", "Do not carry forward layers from existing .genart")
  .action(async (dir: string, opts) => {
    const projectDir = resolve(dir);
    const port = opts.port as number;
    const outputPath = opts.output ? resolve(opts.output as string) : undefined;

    // Track connected WebSocket clients
    const wsClients: Set<(data: string) => void> = new Set();

    // Track latest sketch for serving
    let latestSketch: SketchDefinition | null = null;
    let lastErrors: readonly CompileError[] = [];

    // Initial compile
    const spinner = ora("Compiling...").start();
    try {
      const result = await compileProject({
        projectDir,
        outputPath,
        preserveState: opts.preserveState as boolean,
        preserveLayers: opts.preserveLayers as boolean,
      });
      latestSketch = result.sketch;
      lastErrors = [];
      spinner.succeed(
        chalk.green(`Compiled → ${result.outputPath}`) +
          chalk.dim(` (${result.duration.toFixed(0)}ms)`),
      );
      if (result.warnings.length > 0) {
        for (const warn of result.warnings) {
          console.log(chalk.yellow(`  ⚠ ${warn}`));
        }
      }
    } catch (err) {
      if (err instanceof CompileFailure) {
        lastErrors = err.errors;
        spinner.fail(chalk.red("Initial compilation failed"));
        for (const error of err.errors) {
          console.error(chalk.red(`  ${formatError(error)}`));
        }
        console.log(chalk.dim("\nPreview server will start. Fix errors and save to retry.\n"));
      } else {
        spinner.fail(chalk.red(`Error: ${(err as Error).message}`));
        process.exitCode = 1;
        return;
      }
    }

    // Start HTTP server
    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/" || req.url === "/index.html") {
        if (latestSketch) {
          const html = generatePreviewHtml(latestSketch, port);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(html);
        } else {
          // No successful compile yet — show error page
          const errorHtml = generateErrorHtml(lastErrors, port);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
          });
          res.end(errorHtml);
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    // WebSocket upgrade handler
    server.on("upgrade", (req, socket) => {
      const send = acceptWebSocket(req, socket);
      if (!send) {
        socket.destroy();
        return;
      }
      wsClients.add(send);
      socket.on("close", () => wsClients.delete(send));
      socket.on("error", () => wsClients.delete(send));
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          chalk.red(`Port ${port} is already in use.`) +
            "\n" +
            chalk.dim(`Try: genart dev ${dir} --port ${port + 1}`),
        );
        process.exitCode = 1;
      } else {
        console.error(chalk.red(`Server error: ${err.message}`));
        process.exitCode = 1;
      }
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(chalk.cyan(`\n  Preview: ${url}\n`));
      console.log(chalk.dim("  Watching for changes... (Ctrl+C to stop)\n"));

      if (opts.open) {
        openBrowser(url);
      }
    });

    // Start file watcher
    const watcher = watchProject(
      projectDir,
      (result) => {
        if ("errors" in result) {
          const errors = result.errors as readonly CompileError[];
          lastErrors = errors;
          console.log(chalk.red(`✗ Compilation failed`));
          for (const error of errors) {
            console.error(chalk.red(`  ${formatError(error)}`));
          }
          // Still notify clients to reload (they'll see the error page)
          for (const send of wsClients) {
            try {
              send("reload");
            } catch {
              // Client disconnected
            }
          }
        } else {
          const r = result as CompileResult;
          latestSketch = r.sketch;
          lastErrors = [];
          console.log(
            chalk.green(`✓ Compiled`) +
              chalk.dim(` (${r.duration.toFixed(0)}ms)`),
          );
          if (r.warnings.length > 0) {
            for (const warn of r.warnings) {
              console.log(chalk.yellow(`  ⚠ ${warn}`));
            }
          }
          // Notify all connected clients to reload
          for (const send of wsClients) {
            try {
              send("reload");
            } catch {
              // Client disconnected
            }
          }
        }
      },
      {
        outputPath,
        preserveState: opts.preserveState as boolean,
        preserveLayers: opts.preserveLayers as boolean,
      },
    );

    // Graceful shutdown
    const shutdown = () => {
      console.log(chalk.dim("\nShutting down..."));
      watcher.close();
      for (const send of wsClients) {
        try {
          send("close");
        } catch {
          // Ignore
        }
      }
      server.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep alive
    await new Promise(() => {});
  });

/** Generate an error page with auto-reload via WebSocket. */
function generateErrorHtml(errors: readonly CompileError[], wsPort: number): string {
  const errorList = errors
    .map((e) => {
      const loc = e.line ? `:${e.line}${e.column ? `:${e.column}` : ""}` : "";
      return `<div class="error"><span class="file">${escapeHtml(e.file)}${loc}</span> ${escapeHtml(e.message)}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>genart dev — compilation error</title>
<style>
  body { margin: 0; padding: 32px; background: #1a1a1a; color: #e0e0e0; font-family: 'JetBrains Mono', 'SF Mono', monospace; font-size: 14px; }
  h1 { color: #ff6b6b; font-size: 18px; margin-bottom: 24px; }
  .error { margin-bottom: 12px; line-height: 1.5; }
  .file { color: #ffa94d; }
</style>
</head>
<body>
<h1>Compilation Error</h1>
${errorList || '<div class="error">Unknown error</div>'}
<script>
(function() {
  var ws;
  function connect() {
    ws = new WebSocket('ws://localhost:${wsPort}');
    ws.onmessage = function(e) {
      if (e.data === 'reload') window.location.reload();
    };
    ws.onclose = function() { setTimeout(connect, 1000); };
  }
  connect();
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Open a URL in the default browser. */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}
