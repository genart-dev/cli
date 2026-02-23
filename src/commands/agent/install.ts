/**
 * genart agent install — auto-configure MCP for supported AI clients.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  CLIENTS,
  findClient,
  getConfigPath,
  detectGenartBin,
  isInPath,
  readClientConfig,
  writeClientConfig,
  getNestedValue,
  setNestedValue,
  deleteNestedValue,
} from "./clients.js";

export const installCommand = new Command("install")
  .description("Configure MCP for an AI client")
  .argument("[client]", "Client to configure (claude, codex, cursor, vscode, gemini, opencode, kiro, windsurf)")
  .option("--all", "Configure all detected clients")
  .option("--remove", "Remove genart configuration")
  .option("--dry-run", "Preview changes without writing")
  .option("--npx", "Force npx invocation instead of global binary")
  .action(async (clientArg: string | undefined, opts) => {
    const isRemove = opts.remove as boolean | undefined;
    const isDryRun = opts.dryRun as boolean | undefined;
    const forceNpx = opts.npx as boolean | undefined;
    const installAll = opts.all as boolean | undefined;

    // Determine which clients to configure
    let targets: typeof CLIENTS;

    if (installAll) {
      // --all: configure every client that has its binary installed
      targets = CLIENTS.filter((c) => isInPath(c.binaryName));
      if (targets.length === 0) {
        console.log(chalk.yellow("No supported AI clients detected in PATH."));
        console.log(
          chalk.dim(
            "Supported: " + CLIENTS.map((c) => c.id).join(", "),
          ),
        );
        return;
      }
    } else if (clientArg) {
      const client = findClient(clientArg);
      if (!client) {
        console.error(
          chalk.red(`Unknown client: ${clientArg}`) +
            "\n" +
            chalk.dim(
              "Available: " + CLIENTS.map((c) => c.id).join(", "),
            ),
        );
        process.exitCode = 1;
        return;
      }
      targets = [client];
    } else {
      console.error(
        chalk.red("Specify a client or use --all") +
          "\n" +
          chalk.dim("Usage: genart agent install <client>") +
          "\n" +
          chalk.dim("       genart agent install --all") +
          "\n\n" +
          chalk.dim("Available: " + CLIENTS.map((c) => c.id).join(", ")),
      );
      process.exitCode = 1;
      return;
    }

    // Build the genart entry
    const bin = forceNpx
      ? { command: "npx", args: ["-y", "@genart-dev/cli", "agent", "stdio"] }
      : detectGenartBin();

    const entry = { command: bin.command, args: bin.args };

    for (const client of targets) {
      const configPath = getConfigPath(client);

      try {
        if (isRemove) {
          await removeClient(client, configPath, isDryRun);
        } else {
          await installClient(client, configPath, entry, isDryRun);
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EACCES") {
          console.error(
            chalk.red(`Permission denied: ${configPath}`) +
              "\n" +
              chalk.dim("Check file permissions and try again."),
          );
        } else {
          console.error(
            chalk.red(`Failed to configure ${client.name}: ${(err as Error).message}`),
          );
        }
        process.exitCode = 1;
      }
    }
  });

async function installClient(
  client: (typeof CLIENTS)[number],
  configPath: string,
  entry: Record<string, unknown>,
  isDryRun?: boolean,
): Promise<void> {
  const config = await readClientConfig(client);

  // Navigate to servers key and set genart entry
  let servers = getNestedValue(config, client.serversKey) as
    | Record<string, unknown>
    | undefined;
  if (!servers || typeof servers !== "object") {
    servers = {};
    setNestedValue(config, client.serversKey, servers);
  }
  servers["genart"] = entry;

  if (isDryRun) {
    console.log(chalk.dim(`[dry-run] ${client.name} (${configPath}):`));
    if (client.format === "toml") {
      const { stringify } = await import("smol-toml");
      console.log(chalk.dim(stringify(config)));
    } else {
      console.log(chalk.dim(JSON.stringify(config, null, 2)));
    }
    return;
  }

  await writeClientConfig(client, config);
  console.log(
    chalk.green(`Configured ${client.name}`) +
      chalk.dim(` (${configPath})`),
  );
}

async function removeClient(
  client: (typeof CLIENTS)[number],
  configPath: string,
  isDryRun?: boolean,
): Promise<void> {
  const config = await readClientConfig(client);
  const servers = getNestedValue(config, client.serversKey) as
    | Record<string, unknown>
    | undefined;

  if (!servers || !("genart" in servers)) {
    console.log(chalk.dim(`${client.name}: not configured, nothing to remove`));
    return;
  }

  deleteNestedValue(config, client.serversKey, "genart");

  if (isDryRun) {
    console.log(chalk.dim(`[dry-run] Would remove genart from ${client.name} (${configPath})`));
    return;
  }

  await writeClientConfig(client, config);
  console.log(
    chalk.green(`Removed genart from ${client.name}`) +
      chalk.dim(` (${configPath})`),
  );
}
