import { Command } from "commander";
import { renderCommand } from "./commands/render.js";
import { infoCommand } from "./commands/info.js";
import { validateCommand } from "./commands/validate.js";
import { initCommand } from "./commands/init.js";
import { exportCommand } from "./commands/export.js";
import { batchCommand } from "./commands/batch.js";
import { montageCommand } from "./commands/montage.js";
import { importCommand } from "./commands/import.js";
import { videoCommand } from "./commands/video.js";
import { agentCommand } from "./commands/agent/index.js";
import { compileCommand } from "./commands/compile.js";
import { ejectCommand } from "./commands/eject.js";
import { devCommand } from "./commands/dev.js";

const program = new Command();

program
  .name("genart")
  .description("CLI for genart.dev — render, batch, montage, import, validate, export, compile, dev, and scaffold generative art sketches")
  .version("0.2.0");

program.addCommand(renderCommand);
program.addCommand(infoCommand);
program.addCommand(validateCommand);
program.addCommand(initCommand);
program.addCommand(exportCommand);
program.addCommand(batchCommand);
program.addCommand(montageCommand);
program.addCommand(importCommand);
program.addCommand(videoCommand);
program.addCommand(agentCommand);
program.addCommand(compileCommand);
program.addCommand(ejectCommand);
program.addCommand(devCommand);

program.parse();
