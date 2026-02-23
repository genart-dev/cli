/**
 * genart agent — MCP server and agent configuration command group.
 */

import { Command } from "commander";
import { stdioCommand } from "./stdio.js";
import { httpCommand } from "./http.js";
import { sidecarCommand } from "./sidecar.js";
import { installCommand } from "./install.js";
import { doctorCommand } from "./doctor.js";

export const agentCommand = new Command("agent")
  .description("MCP server and agent configuration");

agentCommand.addCommand(stdioCommand);
agentCommand.addCommand(httpCommand);
agentCommand.addCommand(sidecarCommand);
agentCommand.addCommand(installCommand);
agentCommand.addCommand(doctorCommand);
