import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

// Mock child_process for isInPath
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
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

describe("clients", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "genart-clients-test-"));
    mockHome.value = tempDir;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("CLIENTS registry", () => {
    it("has 8 clients", async () => {
      const { CLIENTS } = await import("./clients.js");
      expect(CLIENTS).toHaveLength(8);
    });

    it("all clients have required fields", async () => {
      const { CLIENTS } = await import("./clients.js");
      for (const client of CLIENTS) {
        expect(client.id).toBeTruthy();
        expect(client.name).toBeTruthy();
        expect(client.configRelPath).toBeTruthy();
        expect(["json", "toml"]).toContain(client.format);
        expect(client.serversKey).toBeTruthy();
        expect(client.binaryName).toBeTruthy();
      }
    });

    it("has unique ids", async () => {
      const { CLIENTS } = await import("./clients.js");
      const ids = CLIENTS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("findClient returns matching client", async () => {
      const { findClient } = await import("./clients.js");
      const claude = findClient("claude");
      expect(claude?.name).toBe("Claude Code");
      expect(claude?.format).toBe("json");
    });

    it("findClient returns undefined for unknown", async () => {
      const { findClient } = await import("./clients.js");
      expect(findClient("unknown")).toBeUndefined();
    });
  });

  describe("isInPath", () => {
    it("returns true when binary exists", async () => {
      const { execSync } = await import("node:child_process");
      vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/bin/node"));
      const { isInPath } = await import("./clients.js");
      expect(isInPath("node")).toBe(true);
    });

    it("returns false when binary not found", async () => {
      const { execSync } = await import("node:child_process");
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      const { isInPath } = await import("./clients.js");
      expect(isInPath("nonexistent-bin")).toBe(false);
    });
  });

  describe("detectGenartBin", () => {
    it("returns genart when in PATH", async () => {
      const { execSync } = await import("node:child_process");
      vi.mocked(execSync).mockReturnValue(Buffer.from("/usr/local/bin/genart"));
      const { detectGenartBin } = await import("./clients.js");
      const result = detectGenartBin();
      expect(result.command).toBe("genart");
      expect(result.args).toEqual(["agent", "stdio"]);
    });

    it("falls back to npx when not in PATH", async () => {
      const { execSync } = await import("node:child_process");
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      const { detectGenartBin } = await import("./clients.js");
      const result = detectGenartBin();
      expect(result.command).toBe("npx");
      expect(result.args).toEqual(["-y", "@genart-dev/cli", "agent", "stdio"]);
    });
  });

  describe("nested value helpers", () => {
    it("getNestedValue with simple key", async () => {
      const { getNestedValue } = await import("./clients.js");
      const obj = { mcpServers: { genart: { command: "genart" } } };
      expect(getNestedValue(obj, "mcpServers")).toEqual({
        genart: { command: "genart" },
      });
    });

    it("getNestedValue with dot path", async () => {
      const { getNestedValue } = await import("./clients.js");
      const obj = { mcp: { servers: { genart: { command: "genart" } } } };
      expect(getNestedValue(obj, "mcp.servers")).toEqual({
        genart: { command: "genart" },
      });
    });

    it("getNestedValue returns undefined for missing path", async () => {
      const { getNestedValue } = await import("./clients.js");
      expect(getNestedValue({}, "foo.bar")).toBeUndefined();
    });

    it("setNestedValue with simple key", async () => {
      const { setNestedValue } = await import("./clients.js");
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, "mcpServers", { genart: {} });
      expect(obj).toEqual({ mcpServers: { genart: {} } });
    });

    it("setNestedValue with dot path creates intermediates", async () => {
      const { setNestedValue } = await import("./clients.js");
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, "mcp.servers", { genart: {} });
      expect(obj).toEqual({ mcp: { servers: { genart: {} } } });
    });

    it("deleteNestedValue removes key and cleans empty container", async () => {
      const { deleteNestedValue } = await import("./clients.js");
      const obj: Record<string, unknown> = {
        mcpServers: { genart: { command: "genart" } },
      };
      deleteNestedValue(obj, "mcpServers", "genart");
      expect(obj).toEqual({});
    });

    it("deleteNestedValue preserves other entries", async () => {
      const { deleteNestedValue } = await import("./clients.js");
      const obj: Record<string, unknown> = {
        mcpServers: {
          genart: { command: "genart" },
          other: { command: "other" },
        },
      };
      deleteNestedValue(obj, "mcpServers", "genart");
      expect(obj).toEqual({
        mcpServers: { other: { command: "other" } },
      });
    });
  });

  describe("JSON config read/write", () => {
    it("readJsonConfig returns {} on ENOENT", async () => {
      const { readJsonConfig } = await import("./clients.js");
      const result = await readJsonConfig(join(tempDir, "nonexistent.json"));
      expect(result).toEqual({});
    });

    it("readJsonConfig parses existing file", async () => {
      const { writeFile: fsWrite } = await import("node:fs/promises");
      const filePath = join(tempDir, "test.json");
      await fsWrite(filePath, '{"foo":"bar"}');
      const { readJsonConfig } = await import("./clients.js");
      const result = await readJsonConfig(filePath);
      expect(result).toEqual({ foo: "bar" });
    });

    it("writeJsonConfig creates dirs and writes formatted JSON", async () => {
      const { writeJsonConfig, readJsonConfig } = await import("./clients.js");
      const filePath = join(tempDir, "sub/dir/test.json");
      await writeJsonConfig(filePath, { hello: "world" });
      const raw = await readFile(filePath, "utf-8");
      expect(raw).toBe('{\n  "hello": "world"\n}\n');
      const result = await readJsonConfig(filePath);
      expect(result).toEqual({ hello: "world" });
    });
  });

  describe("TOML config read/write", () => {
    it("readTomlConfig returns {} on ENOENT", async () => {
      const { readTomlConfig } = await import("./clients.js");
      const result = await readTomlConfig(join(tempDir, "nonexistent.toml"));
      expect(result).toEqual({});
    });

    it("writeTomlConfig creates dirs and writes TOML", async () => {
      const { writeTomlConfig, readTomlConfig } = await import("./clients.js");
      const filePath = join(tempDir, "sub/config.toml");
      await writeTomlConfig(filePath, { section: { key: "value" } });
      const result = await readTomlConfig(filePath);
      expect(result).toEqual({ section: { key: "value" } });
    });
  });

  describe("isConfigured", () => {
    it("returns false when config file missing", async () => {
      const { isConfigured, CLIENTS } = await import("./clients.js");
      const claude = CLIENTS.find((c) => c.id === "claude")!;
      expect(await isConfigured(claude)).toBe(false);
    });

    it("returns true when genart entry exists", async () => {
      const { isConfigured, writeJsonConfig, CLIENTS } = await import("./clients.js");
      const claude = CLIENTS.find((c) => c.id === "claude")!;
      const configPath = join(tempDir, claude.configRelPath);
      await writeJsonConfig(configPath, {
        mcpServers: { genart: { command: "genart", args: ["agent", "stdio"] } },
      });
      expect(await isConfigured(claude)).toBe(true);
    });

    it("returns false when servers key exists but no genart entry", async () => {
      const { isConfigured, writeJsonConfig, CLIENTS } = await import("./clients.js");
      const claude = CLIENTS.find((c) => c.id === "claude")!;
      const configPath = join(tempDir, claude.configRelPath);
      await writeJsonConfig(configPath, {
        mcpServers: { other: { command: "other" } },
      });
      expect(await isConfigured(claude)).toBe(false);
    });
  });
});
