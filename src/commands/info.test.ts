import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

describe("info command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("outputs human-readable info for a valid file", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const { infoCommand } = await import("./info.js");
    await infoCommand.parseAsync(["node", "info", FIXTURE]);

    const output = logs.join("\n");
    expect(output).toContain("Test Sketch");
    expect(output).toContain("p5");
    expect(output).toContain("600×600");
    expect(output).toContain("42");
    expect(output).toContain("amplitude");
    expect(output).toContain("frequency");
  });

  it("outputs JSON with --json flag", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const { infoCommand } = await import("./info.js");
    await infoCommand.parseAsync(["node", "info", "--json", FIXTURE]);

    const output = logs.join("\n");
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed["id"]).toBe("test-sketch");
    expect(parsed["title"]).toBe("Test Sketch");
  });

  it("outputs table with --table flag", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const { infoCommand } = await import("./info.js");
    await infoCommand.parseAsync(["node", "info", "--table", FIXTURE]);

    const output = logs.join("\n");
    expect(output).toContain("File");
    expect(output).toContain("Title");
    expect(output).toContain("Test Sketch");
  });
});
