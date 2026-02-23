/**
 * Client config registry + read/write helpers.
 * Defines supported AI clients and their MCP configuration locations.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

/** Static definition for a supported AI client. */
export interface ClientDefinition {
  /** CLI argument id (e.g. "claude"). */
  readonly id: string;
  /** Display name (e.g. "Claude Code"). */
  readonly name: string;
  /** Config file path relative to home dir. */
  readonly configRelPath: string;
  /** Config file format. */
  readonly format: "json" | "toml";
  /** Dot-delimited key path to the MCP servers map (e.g. "mcp.servers"). */
  readonly serversKey: string;
  /** Binary name for PATH detection. */
  readonly binaryName: string;
}

/** Registry of supported AI clients. */
export const CLIENTS: ClientDefinition[] = [
  {
    id: "claude",
    name: "Claude Code",
    configRelPath: ".claude.json",
    format: "json",
    serversKey: "mcpServers",
    binaryName: "claude",
  },
  {
    id: "codex",
    name: "Codex CLI",
    configRelPath: ".codex/config.toml",
    format: "toml",
    serversKey: "mcp_servers",
    binaryName: "codex",
  },
  {
    id: "cursor",
    name: "Cursor",
    configRelPath: ".cursor/mcp.json",
    format: "json",
    serversKey: "mcpServers",
    binaryName: "cursor",
  },
  {
    id: "vscode",
    name: "VS Code",
    configRelPath:
      process.platform === "darwin"
        ? "Library/Application Support/Code/User/settings.json"
        : process.platform === "win32"
          ? "AppData/Roaming/Code/User/settings.json"
          : ".config/Code/User/settings.json",
    format: "json",
    serversKey: "mcp.servers",
    binaryName: "code",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    configRelPath: ".gemini/settings.json",
    format: "json",
    serversKey: "mcpServers",
    binaryName: "gemini",
  },
  {
    id: "opencode",
    name: "OpenCode",
    configRelPath: ".config/opencode/opencode.json",
    format: "json",
    serversKey: "mcp",
    binaryName: "opencode",
  },
  {
    id: "kiro",
    name: "Kiro",
    configRelPath: ".kiro/settings/mcp.json",
    format: "json",
    serversKey: "mcpServers",
    binaryName: "kiro",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    configRelPath: ".codeium/windsurf/mcp_config.json",
    format: "json",
    serversKey: "mcpServers",
    binaryName: "windsurf",
  },
];

/** Find a client definition by id. */
export function findClient(id: string): ClientDefinition | undefined {
  return CLIENTS.find((c) => c.id === id);
}

/** Get the absolute config path for a client. */
export function getConfigPath(client: ClientDefinition): string {
  return join(homedir(), client.configRelPath);
}

/** Check if a binary exists in PATH. */
export function isInPath(binary: string): boolean {
  try {
    const cmd = process.platform === "win32" ? `where.exe ${binary}` : `which ${binary}`;
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** Detect how to invoke genart: direct binary or npx fallback. */
export function detectGenartBin(): { command: string; args: string[] } {
  if (isInPath("genart")) {
    return { command: "genart", args: ["agent", "stdio"] };
  }
  return { command: "npx", args: ["-y", "@genart-dev/cli", "agent", "stdio"] };
}

/** Get a nested value from an object by dot-delimited path. */
export function getNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
): unknown {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Set a nested value in an object by dot-delimited path. Creates intermediate objects. */
export function setNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
  value: unknown,
): void {
  const parts = dotPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

/** Delete a nested value by dot-delimited path. Cleans up empty parent containers. */
export function deleteNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
  childKey: string,
): void {
  const servers = getNestedValue(obj, dotPath) as Record<string, unknown> | undefined;
  if (!servers || typeof servers !== "object") return;
  delete servers[childKey];

  // Clean up empty containers
  if (Object.keys(servers).length === 0) {
    const parts = dotPath.split(".");
    if (parts.length === 1) {
      delete obj[parts[0]!];
    } else {
      const parentPath = parts.slice(0, -1).join(".");
      const lastKey = parts[parts.length - 1]!;
      const parent = getNestedValue(obj, parentPath) as Record<string, unknown> | undefined;
      if (parent) {
        delete parent[lastKey];
      }
    }
  }
}

/** Read a JSON config file. Returns {} on ENOENT. */
export async function readJsonConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

/** Write a JSON config file. Creates parent directories. */
export async function writeJsonConfig(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Read a TOML config file. Returns {} on ENOENT. */
export async function readTomlConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf-8");
    return parseToml(raw) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

/** Write a TOML config file. Creates parent directories. */
export async function writeTomlConfig(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringifyToml(data) + "\n", "utf-8");
}

/** Read a client config (dispatches JSON vs TOML). */
export async function readClientConfig(
  client: ClientDefinition,
): Promise<Record<string, unknown>> {
  const path = getConfigPath(client);
  return client.format === "toml" ? readTomlConfig(path) : readJsonConfig(path);
}

/** Write a client config (dispatches JSON vs TOML). */
export async function writeClientConfig(
  client: ClientDefinition,
  data: Record<string, unknown>,
): Promise<void> {
  const path = getConfigPath(client);
  return client.format === "toml"
    ? writeTomlConfig(path, data)
    : writeJsonConfig(path, data);
}

/** Check if genart is already configured in a client. */
export async function isConfigured(client: ClientDefinition): Promise<boolean> {
  const config = await readClientConfig(client);
  const servers = getNestedValue(config, client.serversKey);
  if (!servers || typeof servers !== "object") return false;
  return "genart" in (servers as Record<string, unknown>);
}
