import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

// Mock child_process for isInPath
vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error("not found");
  }),
}));

// Mock browser module for findChromePath
vi.mock("../../capture/browser.js", () => ({
  findChromePath: vi.fn().mockReturnValue(undefined),
}));

// Mock os.homedir
const mockHome = vi.hoisted(() => ({ value: "/tmp/mock-home" }));
vi.mock("node:os", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:os")>();
  return {
    ...orig,
    homedir: () => mockHome.value,
  };
});

describe("doctor command", () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "genart-doctor-test-"));
    mockHome.value = tempDir;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(async () => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("prints CLI version", async () => {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("@genart-dev/cli installed");
  });

  it("checks mcp-server availability", async () => {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("@genart-dev/mcp-server");
  });

  it("reports Chrome status", async () => {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    // Chrome is mocked as not found
    expect(output).toContain("Chrome");
  });

  it("reports Chrome found when available", async () => {
    const { findChromePath } = await import("../../capture/browser.js");
    vi.mocked(findChromePath).mockReturnValue("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");

    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Chrome available");
  });

  it("reports ffmpeg status", async () => {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("ffmpeg");
  });

  it("reports ffmpeg found when in PATH", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === "string" && cmd.includes("ffmpeg")) {
        return Buffer.from("/usr/local/bin/ffmpeg");
      }
      throw new Error("not found");
    });

    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("ffmpeg available");
  });

  it("lists client configurations section", async () => {
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Client configurations");
  });

  it("shows configured client as configured", async () => {
    // Write a claude config with genart entry
    const { writeJsonConfig } = await import("./clients.js");
    await writeJsonConfig(join(tempDir, ".claude.json"), {
      mcpServers: { genart: { command: "genart", args: ["agent", "stdio"] } },
    });

    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("Claude Code");
    expect(output).toContain("configured");
  });

  it("exits with code 1 when warnings exist", async () => {
    // No Chrome, no ffmpeg, no sharp — warnings expected
    const { doctorCommand } = await import("./doctor.js");
    await doctorCommand.parseAsync(["node", "doctor"]);

    expect(process.exitCode).toBe(1);
  });
});
