import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockHandleRequest = vi.fn().mockResolvedValue(undefined);

vi.mock("@genart-dev/mcp-server/lib", () => ({
  EditorState: vi.fn().mockImplementation(() => ({
    basePath: "",
  })),
  createServer: vi.fn().mockReturnValue({
    connect: mockConnect,
    close: mockClose,
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: mockHandleRequest,
  })),
}));

describe("http command", () => {
  let server: Server | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (server?.listening) {
      server.close();
    }
  });

  it("creates EditorState and StreamableHTTPServerTransport", async () => {
    const { httpCommand } = await import("./http.js");
    const { EditorState, createServer } = await import("@genart-dev/mcp-server/lib");
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );

    // Use random port to avoid conflicts
    const port = 30000 + Math.floor(Math.random() * 10000);

    const promise = httpCommand.parseAsync([
      "node", "http", "--port", String(port),
    ]);

    // Give the server time to start
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(EditorState).toHaveBeenCalledOnce();
    expect(createServer).toHaveBeenCalledOnce();
    expect(StreamableHTTPServerTransport).toHaveBeenCalledOnce();
    expect(mockConnect).toHaveBeenCalledOnce();

    // Clean up: the command keeps the process alive, so we need to force close
    // We can't easily get a handle to the server, so we just verify the setup
  });

  it("responds 200 on /health", async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);

    const { httpCommand } = await import("./http.js");
    httpCommand.parseAsync(["node", "http", "--port", String(port)]);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("responds 404 on unknown paths", async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);

    const { httpCommand } = await import("./http.js");
    httpCommand.parseAsync(["node", "http", "--port", String(port)]);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });

  it("delegates /mcp to transport.handleRequest", async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);

    const { httpCommand } = await import("./http.js");
    httpCommand.parseAsync(["node", "http", "--port", String(port)]);

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Post to /mcp — the mock handler will resolve without writing a response,
    // so this may hang. We just check that handleRequest was called.
    mockHandleRequest.mockImplementation((_req: unknown, res: { writeHead: (code: number) => void; end: () => void }) => {
      (res as { writeHead: (n: number) => void }).writeHead(200);
      (res as { end: () => void }).end();
    });

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
    });

    expect(mockHandleRequest).toHaveBeenCalled();
  });

  it("includes CORS headers when --cors is set", async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);

    const { httpCommand } = await import("./http.js");
    httpCommand.parseAsync(["node", "http", "--port", String(port), "--cors"]);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("no CORS headers by default", async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);

    const { httpCommand } = await import("./http.js");
    httpCommand.parseAsync(["node", "http", "--port", String(port)]);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("handles OPTIONS with 204 when CORS enabled", async () => {
    const port = 30000 + Math.floor(Math.random() * 10000);

    const { httpCommand } = await import("./http.js");
    httpCommand.parseAsync(["node", "http", "--port", String(port), "--cors"]);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
  });

  it("sets basePath from --base-path option", async () => {
    const { httpCommand } = await import("./http.js");
    const { EditorState } = await import("@genart-dev/mcp-server/lib");

    const port = 30000 + Math.floor(Math.random() * 10000);
    httpCommand.parseAsync([
      "node", "http", "--port", String(port), "--base-path", "/my/art",
    ]);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const state = vi.mocked(EditorState).mock.results[0]!.value as { basePath: string };
    expect(state.basePath).toBe("/my/art");
  });
});
