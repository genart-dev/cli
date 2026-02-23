import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock("@genart-dev/mcp-server/lib", () => ({
  EditorState: vi.fn().mockImplementation(() => ({
    basePath: "",
  })),
  createServer: vi.fn().mockReturnValue({
    connect: mockConnect,
    close: mockClose,
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    type: "stdio",
  })),
}));

describe("stdio command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates EditorState and connects StdioServerTransport", async () => {
    const { stdioCommand } = await import("./stdio.js");
    const { EditorState, createServer } = await import("@genart-dev/mcp-server/lib");
    const { StdioServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/stdio.js"
    );

    await stdioCommand.parseAsync(["node", "stdio"]);

    expect(EditorState).toHaveBeenCalledOnce();
    expect(createServer).toHaveBeenCalledOnce();
    expect(StdioServerTransport).toHaveBeenCalledOnce();
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("sets basePath from --base-path option", async () => {
    const { stdioCommand } = await import("./stdio.js");
    const { EditorState } = await import("@genart-dev/mcp-server/lib");

    await stdioCommand.parseAsync(["node", "stdio", "--base-path", "/tmp/art"]);

    const state = vi.mocked(EditorState).mock.results[0]!.value as { basePath: string };
    expect(state.basePath).toBe("/tmp/art");
  });

  it("logs to stderr, not stdout", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { stdioCommand } = await import("./stdio.js");
    await stdioCommand.parseAsync(["node", "stdio"]);

    expect(stderrSpy).toHaveBeenCalled();
    // The stdio command itself should not write to stdout
    expect(stdoutSpy).not.toHaveBeenCalled();

    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });
});
