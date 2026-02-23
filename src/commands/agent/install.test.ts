import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parse as parseToml } from "smol-toml";

// Mock child_process for isInPath/detectGenartBin
vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

// Mock os.homedir to use temp dir
const mockHome = vi.hoisted(() => ({ value: "/tmp/mock-home" }));
vi.mock("node:os", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:os")>();
  return {
    ...orig,
    homedir: () => mockHome.value,
  };
});

describe("install command", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset execSync to default "not found" behavior (clearAllMocks doesn't reset implementations)
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("not found");
    });
    tempDir = await mkdtemp(join(tmpdir(), "genart-install-test-"));
    mockHome.value = tempDir;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes claude config with npx fallback", async () => {
    const { installCommand } = await import("./install.js");

    await installCommand.parseAsync(["node", "install", "claude"]);

    const configPath = join(tempDir, ".claude.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { genart: { command: string; args: string[] } };
    };

    expect(config.mcpServers.genart.command).toBe("npx");
    expect(config.mcpServers.genart.args).toEqual([
      "-y", "@genart-dev/cli", "agent", "stdio",
    ]);
  });

  it("writes claude config with genart binary when in PATH", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/genart"));

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude"]);

    const configPath = join(tempDir, ".claude.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { genart: { command: string; args: string[] } };
    };

    expect(config.mcpServers.genart.command).toBe("genart");
    expect(config.mcpServers.genart.args).toEqual(["agent", "stdio"]);
  });

  it("writes codex TOML config", async () => {
    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "codex"]);

    const configPath = join(tempDir, ".codex/config.toml");
    const raw = await readFile(configPath, "utf-8");
    const config = parseToml(raw) as {
      mcp_servers: { genart: { command: string; args: string[] } };
    };

    expect(config.mcp_servers.genart.command).toBe("npx");
    expect(config.mcp_servers.genart.args).toContain("agent");
  });

  it("writes cursor config", async () => {
    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "cursor"]);

    const configPath = join(tempDir, ".cursor/mcp.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { genart: { command: string } };
    };

    expect(config.mcpServers.genart).toBeDefined();
  });

  it("writes vscode config with nested mcp.servers key", async () => {
    const { installCommand } = await import("./install.js");

    // Pre-populate with existing settings
    const { writeJsonConfig } = await import("./clients.js");
    const { CLIENTS } = await import("./clients.js");
    const vscode = CLIENTS.find((c) => c.id === "vscode")!;
    const configPath = join(tempDir, vscode.configRelPath);
    await writeJsonConfig(configPath, {
      "editor.fontSize": 14,
    });

    await installCommand.parseAsync(["node", "install", "vscode"]);

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      "editor.fontSize": number;
      mcp: { servers: { genart: { command: string } } };
    };

    expect(config["editor.fontSize"]).toBe(14);
    expect(config.mcp.servers.genart).toBeDefined();
  });

  it("preserves existing entries in config", async () => {
    const { writeJsonConfig } = await import("./clients.js");
    const configPath = join(tempDir, ".claude.json");
    await writeJsonConfig(configPath, {
      mcpServers: { other: { command: "other-tool" } },
    });

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude"]);

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { genart: unknown; other: { command: string } };
    };

    expect(config.mcpServers.other.command).toBe("other-tool");
    expect(config.mcpServers.genart).toBeDefined();
  });

  it("--remove deletes genart entry", async () => {
    // First install
    const { writeJsonConfig } = await import("./clients.js");
    const configPath = join(tempDir, ".claude.json");
    await writeJsonConfig(configPath, {
      mcpServers: {
        genart: { command: "genart", args: ["agent", "stdio"] },
        other: { command: "other" },
      },
    });

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude", "--remove"]);

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { other: unknown };
    };

    expect(config.mcpServers.other).toBeDefined();
    expect("genart" in config.mcpServers).toBe(false);
  });

  it("--remove cleans up empty server container", async () => {
    const { writeJsonConfig } = await import("./clients.js");
    const configPath = join(tempDir, ".claude.json");
    await writeJsonConfig(configPath, {
      mcpServers: {
        genart: { command: "genart", args: ["agent", "stdio"] },
      },
    });

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude", "--remove"]);

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;

    expect(config.mcpServers).toBeUndefined();
  });

  it("--remove is a no-op when not configured", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude", "--remove"]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("nothing to remove"),
    );

    logSpy.mockRestore();
  });

  it("--dry-run does not write to disk", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude", "--dry-run"]);

    const configPath = join(tempDir, ".claude.json");
    await expect(readFile(configPath, "utf-8")).rejects.toThrow();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("[dry-run]"),
    );

    logSpy.mockRestore();
  });

  it("--npx forces npx invocation", async () => {
    // Even if genart is in PATH, --npx should force npx
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/genart"));

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "claude", "--npx"]);

    const configPath = join(tempDir, ".claude.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { genart: { command: string } };
    };

    expect(config.mcpServers.genart.command).toBe("npx");
  });

  it("errors on unknown client", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "unknown-client"]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown client"),
    );
    expect(process.exitCode).toBe(1);

    errorSpy.mockRestore();
    process.exitCode = 0;
  });

  it("errors when no client specified and no --all", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install"]);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Specify a client"),
    );
    expect(process.exitCode).toBe(1);

    errorSpy.mockRestore();
    process.exitCode = 0;
  });

  it("--all configures only detected clients", async () => {
    const { execSync } = await import("node:child_process");
    // Simulate only 'claude' binary in PATH
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("claude")) {
        return Buffer.from("/usr/local/bin/claude");
      }
      throw new Error("not found");
    });

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "--all"]);

    // Claude config should exist
    const claudePath = join(tempDir, ".claude.json");
    const raw = await readFile(claudePath, "utf-8");
    const config = JSON.parse(raw) as { mcpServers: { genart: unknown } };
    expect(config.mcpServers.genart).toBeDefined();

    // Codex config should NOT exist
    const codexPath = join(tempDir, ".codex/config.toml");
    await expect(readFile(codexPath, "utf-8")).rejects.toThrow();
  });

  it("--all reports when no clients detected", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "--all"]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("No supported AI clients detected"),
    );

    logSpy.mockRestore();
  });

  it("creates missing directories for config files", async () => {
    const { installCommand } = await import("./install.js");
    await installCommand.parseAsync(["node", "install", "kiro"]);

    const configPath = join(tempDir, ".kiro/settings/mcp.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers: { genart: unknown };
    };
    expect(config.mcpServers.genart).toBeDefined();
  });
});
