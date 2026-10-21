// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ANALYST_COMMAND_KIND,
  ANALYST_COMMAND_REASON,
  ENTRY_GATE,
  type AnalystCommandKind,
  type AnalystCommandReason,
  type EntryGate,
} from './analyst.constant.js';
import type { AnalystCommand } from './analyst-decision.types.js';

export type AnalystCommandWallet = {
  readonly isHalted: boolean;
  readonly lastHaltReason: string | null;
  readonly hasPosition: boolean;
};

export type ToAnalystCommandsParams = {
  readonly candleTime: number;
  readonly entryGate: EntryGate;
  readonly timeExitDue: boolean;
  readonly wallet: AnalystCommandWallet;
};

function commandOf(
  candleTime: number,
  kind: AnalystCommandKind,
  reason: AnalystCommandReason,
): AnalystCommand {
  return { commandId: `analyst:${candleTime}:${kind}`, kind, reason };
}

// A tradução da decisão para comandos da carteira (A15), só com o que o analista pode fazer: fechar a porta (`halt`),
// reabrir a que ELE fechou (`resume`) e mandar sair no tempo (`exit_position`). Nunca há comando de entrada, e um `halt`
// de meta, do usuário ou do kill switch nunca é desfeito. Saída por tempo vale em toda vela, inclusive em pausa.
export function toAnalystCommands(params: ToAnalystCommandsParams): readonly AnalystCommand[] {
  const { candleTime, entryGate, timeExitDue, wallet } = params;
  const commands: AnalystCommand[] = [];
  const isOwnHalt = wallet.isHalted && wallet.lastHaltReason === ANALYST_COMMAND_REASON.PAUSE;
  if (entryGate === ENTRY_GATE.CLOSED && !wallet.isHalted) {
    commands.push(commandOf(candleTime, ANALYST_COMMAND_KIND.HALT, ANALYST_COMMAND_REASON.PAUSE));
  }
  if (entryGate === ENTRY_GATE.OPEN && isOwnHalt) {
    commands.push(
      commandOf(candleTime, ANALYST_COMMAND_KIND.RESUME, ANALYST_COMMAND_REASON.RESUME),
    );
  }
  if (timeExitDue && wallet.hasPosition) {
    commands.push(
      commandOf(candleTime, ANALYST_COMMAND_KIND.EXIT_POSITION, ANALYST_COMMAND_REASON.TIMEOUT),
    );
  }
  return commands;
}
