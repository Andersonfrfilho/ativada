// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createCliContext, type CliContext } from './cli-context.js';
import { CLI_COMMAND, type CliCommand } from './live72.constant.js';
import { recordCliCommand } from './live72-events.js';
import { runReport } from './report-command.js';
import { runStatus } from './status-command.js';
import { runDown, runStop } from './stop-command.js';
import { runStart } from './start-command.js';
import { runUp } from './up-command.js';

const CONFIRM_FLAG = '--confirm';

function isCommand(value: string | undefined): value is CliCommand {
  return Object.values<string>(CLI_COMMAND).includes(value ?? '');
}

async function execute(
  command: CliCommand,
  context: CliContext,
  flags: readonly string[],
): Promise<string> {
  switch (command) {
    case CLI_COMMAND.UP:
      return (await runUp(context)).join('\n');
    case CLI_COMMAND.START:
      return (await runStart(context)).join('\n');
    case CLI_COMMAND.STATUS:
      return runStatus(context);
    case CLI_COMMAND.REPORT:
      return runReport(context);
    case CLI_COMMAND.STOP:
      return (await runStop(context)).join('\n');
    case CLI_COMMAND.DOWN:
      if (!flags.includes(CONFIRM_FLAG)) {
        throw new Error('down apaga containers, volumes e dados: rode make live72-down CONFIRM=1');
      }
      return (await runDown(context)).join('\n');
  }
}

async function main(): Promise<void> {
  const [command, ...flags] = Bun.argv.slice(2);
  if (!isCommand(command)) throw new Error(`comando desconhecido: ${command ?? '(vazio)'}`);
  const context = createCliContext();
  if (command !== CLI_COMMAND.DOWN || flags.includes(CONFIRM_FLAG)) {
    recordCliCommand(context.paths.eventsFile, command);
  }
  console.log(await execute(command, context, flags));
}

try {
  await main();
} catch (error: unknown) {
  console.error(`live72: FALHOU - ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
