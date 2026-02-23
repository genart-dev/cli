import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = resolve(import.meta.dirname, "../__fixtures__/sample.genart");

describe("validate command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("validates a valid .genart file", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const { validateCommand } = await import("./validate.js");
    await validateCommand.parseAsync(["node", "validate", FIXTURE]);

    const output = logs.join("\n");
    expect(output).toContain("✓");
    expect(output).toContain(FIXTURE);
    expect(process.exitCode).toBeUndefined();
  });

  it("reports invalid file with exit code 1", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "genart-test-"));
    const badFile = join(tmpDir, "bad.genart");
    await writeFile(badFile, '{"not": "valid"}', "utf-8");

    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const { validateCommand } = await import("./validate.js");
    await validateCommand.parseAsync(["node", "validate", badFile]);

    expect(process.exitCode).toBe(1);
    const output = errors.join("\n");
    expect(output).toContain("✗");

    await rm(tmpDir, { recursive: true });
  });

  it("validates a directory of .genart files", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "genart-test-"));
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(FIXTURE, "utf-8");
    await writeFile(join(tmpDir, "a.genart"), content, "utf-8");
    await writeFile(join(tmpDir, "b.genart"), content, "utf-8");

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const { validateCommand } = await import("./validate.js");
    await validateCommand.parseAsync(["node", "validate", tmpDir]);

    const output = logs.join("\n");
    expect(output).toContain("✓");
    // Should have validated 2 files
    const matches = output.match(/✓/g);
    expect(matches).toHaveLength(2);

    await rm(tmpDir, { recursive: true });
  });

  it("validates with --strict flag", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const { validateCommand } = await import("./validate.js");
    await validateCommand.parseAsync(["node", "validate", "--strict", FIXTURE]);

    const output = logs.join("\n");
    expect(output).toContain("✓");
  });
});
