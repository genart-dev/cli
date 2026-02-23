import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockConnect = vi.fn().mockResolvedValue(undefined);

vi.mock("@genart-dev/mcp-server/lib", () => ({
  EditorState: vi.fn().mockImplementation(() => ({
    basePath: "",
  })),
  createServer: vi.fn().mockReturnValue({
    connect: mockConnect,
    close: vi.fn(),
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    type: "stdio",
  })),
}));

describe("sidecar command", () => {
  const originalEnv = process.env["GENART_SIDECAR"];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["GENART_SIDECAR"];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["GENART_SIDECAR"] = originalEnv;
    } else {
      delete process.env["GENART_SIDECAR"];
    }
  });

  it("sets GENART_SIDECAR=1 before creating server", async () => {
    const { sidecarCommand } = await import("./sidecar.js");

    await sidecarCommand.parseAsync(["node", "sidecar"]);

    expect(process.env["GENART_SIDECAR"]).toBe("1");
  });

  it("creates EditorState and connects transport", async () => {
    const { sidecarCommand } = await import("./sidecar.js");
    const { EditorState, createServer } = await import("@genart-dev/mcp-server/lib");

    await sidecarCommand.parseAsync(["node", "sidecar"]);

    expect(EditorState).toHaveBeenCalledOnce();
    expect(createServer).toHaveBeenCalledOnce();
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it("sets basePath from --base-path option", async () => {
    const { sidecarCommand } = await import("./sidecar.js");
    const { EditorState } = await import("@genart-dev/mcp-server/lib");

    await sidecarCommand.parseAsync(["node", "sidecar", "--base-path", "/workspace"]);

    const state = vi.mocked(EditorState).mock.results[0]!.value as { basePath: string };
    expect(state.basePath).toBe("/workspace");
  });

  it("logs to stderr", async () => {
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sidecarCommand } = await import("./sidecar.js");
    await sidecarCommand.parseAsync(["node", "sidecar"]);

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("sidecar"),
    );

    stderrSpy.mockRestore();
  });
});
