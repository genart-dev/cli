import { Command } from "commander";
import { renderCommand } from "./commands/render.js";
import { infoCommand } from "./commands/info.js";
import { validateCommand } from "./commands/validate.js";
import { initCommand } from "./commands/init.js";
import { exportCommand } from "./commands/export.js";

const program = new Command();

program
  .name("genart")
  .description("CLI for genart.dev — render, validate, export, and scaffold generative art sketches")
  .version("0.1.0");

program.addCommand(renderCommand);
program.addCommand(infoCommand);
program.addCommand(validateCommand);
program.addCommand(initCommand);
program.addCommand(exportCommand);

program.parse();
