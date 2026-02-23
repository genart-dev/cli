/**
 * genart agent doctor — diagnose genart MCP setup.
 * Checks dependencies, client configurations, and optional tools.
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { findChromePath } from "../../capture/browser.js";
import { CLIENTS, isInPath, isConfigured } from "./clients.js";

export const doctorCommand = new Command("doctor")
  .description("Diagnose genart MCP setup")
  .action(async () => {
    console.log("\n  Checking genart MCP setup...\n");

    let warnings = 0;

    // 1. CLI version
    const pkgPath = join(import.meta.dirname, "../../../package.json");
    let version = "unknown";
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
      version = pkg.version;
    } catch {
      // Fallback — running from source
      version = "0.1.0";
    }
    printCheck(true, `@genart-dev/cli installed (v${version})`);

    // 2. MCP server availability
    let mcpVersion = "";
    try {
      const mcpPkgPath = require.resolve("@genart-dev/mcp-server/package.json", {
        paths: [process.cwd(), import.meta.dirname],
      });
      const mcpPkg = JSON.parse(readFileSync(mcpPkgPath, "utf-8")) as { version: string };
      mcpVersion = mcpPkg.version;
      printCheck(true, `@genart-dev/mcp-server resolved (v${mcpVersion})`);
    } catch {
      // Try dynamic import as fallback
      try {
        await import("@genart-dev/mcp-server/lib");
        printCheck(true, "@genart-dev/mcp-server resolved");
      } catch {
        printCheck(false, "@genart-dev/mcp-server not found");
        warnings++;
      }
    }

    // 3. Chrome availability
    const chromePath = findChromePath();
    if (chromePath) {
      printCheck(true, `Chrome available (${chromePath})`);
    } else {
      printWarning("Chrome not found (render/capture commands unavailable)");
      warnings++;
    }

    // 4. ffmpeg availability
    if (isInPath("ffmpeg")) {
      printCheck(true, "ffmpeg available");
    } else {
      printWarning("ffmpeg not installed (video command unavailable)");
      warnings++;
    }

    // 5. sharp availability
    try {
      await import("sharp");
      printCheck(true, "sharp available");
    } catch {
      printWarning("sharp not installed (montage command unavailable)");
      warnings++;
    }

    // 6. Client configurations
    console.log("\n  Client configurations:\n");

    for (const client of CLIENTS) {
      const installed = isInPath(client.binaryName);
      const configured = await isConfigured(client).catch(() => false);

      if (configured) {
        printCheck(true, `${client.name} \u2014 configured`);
      } else if (installed) {
        printWarning(
          `${client.name} \u2014 installed but not configured (run: genart agent install ${client.id})`,
        );
        warnings++;
      } else {
        printNotInstalled(`${client.name} \u2014 not installed`);
      }
    }

    console.log("");

    process.exitCode = warnings > 0 ? 1 : 0;
  });

function printCheck(pass: boolean, message: string): void {
  const icon = pass ? chalk.green("\u2713") : chalk.red("\u2717");
  console.log(`  ${icon} ${message}`);
}

function printWarning(message: string): void {
  console.log(`  ${chalk.yellow("!")} ${message}`);
}

function printNotInstalled(message: string): void {
  console.log(`  ${chalk.dim("\u25CB")} ${chalk.dim(message)}`);
}
