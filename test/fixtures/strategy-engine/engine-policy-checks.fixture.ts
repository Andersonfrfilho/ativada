// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OrderEvent } from '../../../packages/strategy-engine/src/index.js';
import { assertContract, type CheckContext } from './engine-contract-types.fixture.js';
import { findTerminal } from './engine-order-checks.fixture.js';
import { buildTimeline, type Timeline, type TimelineEntry } from './engine-timeline.fixture.js';

type CloseSituation = {
  readonly hasLiveEntry: boolean;
  readonly hasPosition: boolean;
  readonly isHalted: boolean;
  readonly createdEntry: boolean;
  readonly createdExit: boolean;
  readonly isAfterGap: boolean;
  readonly cancelledBy: (reason: string) => boolean;
  readonly commandKinds: readonly string[];
  readonly blocksEntry: boolean;
};

function isCreatedHere(order: OrderEvent, entry: TimelineEntry): boolean {
  return order.createdCandleOpenTime === entry.step.candle.openTime;
}

// Entrada viva no fechamento: criada antes, sem terminal até aqui (ou cancelada neste fechamento).
function hasLiveEntryAtClose(timeline: Timeline, entry: TimelineEntry): boolean {
  // Depois de uma lacuna a ordem pendente já caducou na abertura: não há entrada viva no fechamento.
  if (entry.step.confirmedGapCandles > 0) return false;
  for (const order of timeline.createdOrders.values()) {
    if (order.purpose !== 'entry' || order.createdIndex >= entry.index) continue;
    if (order.status !== 'created') continue;
    const terminal = findTerminal(timeline, order.orderKey);
    if (terminal === undefined || terminal.entry.index > entry.index) return true;
    if (terminal.entry.index === entry.index && terminal.event.status === 'cancelled') return true;
  }
  return false;
}

function describeClose(timeline: Timeline, entry: TimelineEntry): CloseSituation {
  const { decisions, state } = entry.step.result;
  const createdHere = decisions.orders.filter((order) => isCreatedHere(order, entry));
  const appliedKinds = decisions.commands
    .filter((command) => command.status === 'applied')
    .map((command) => command.kind);
  const isProtective = (order: OrderEvent): boolean =>
    order.type === 'stop' || order.type === 'target';
  return {
    hasLiveEntry: hasLiveEntryAtClose(timeline, entry),
    hasPosition: state.wallet.position !== null,
    isAfterGap: entry.step.confirmedGapCandles > 0,
    isHalted: state.wallet.isHalted,
    createdEntry: createdHere.some((order) => order.purpose === 'entry'),
    createdExit: createdHere.some(
      (order) => order.purpose === 'exit' && !isProtective(order) && order.status === 'created',
    ),
    cancelledBy: (reason) =>
      decisions.orders.some((order) => order.status === 'cancelled' && order.reason === reason),
    commandKinds: appliedKinds,
    blocksEntry: appliedKinds.some((kind) => kind === 'halt' || kind === 'exit_position'),
  };
}

function assertCommands(situation: CloseSituation, label: string): void {
  const stopsEntry = situation.commandKinds.some(
    (kind) => kind === 'halt' || kind === 'exit_position',
  );
  if (stopsEntry && situation.hasLiveEntry) {
    assertContract(
      situation.cancelledBy('command'),
      `${label}: comando não cancelou a entrada viva.`,
    );
  }
  if (situation.commandKinds.includes('exit_position') && situation.hasPosition) {
    assertContract(situation.createdExit, `${label}: exit_position sem venda a mercado para t+1.`);
  }
  if (situation.isHalted)
    assertContract(!situation.createdEntry, `${label}: entrada criada parado (halt).`);
  if (situation.blocksEntry) {
    assertContract(
      !situation.createdEntry,
      `${label}: entrada criada no candle de halt ou exit_position.`,
    );
  }
}

function assertSignal(action: string, situation: CloseSituation, label: string): void {
  const isBusy =
    situation.hasLiveEntry ||
    situation.hasPosition ||
    situation.isHalted ||
    situation.isAfterGap ||
    situation.blocksEntry;
  if (action === 'SELL' && situation.hasLiveEntry && !situation.cancelledBy('command')) {
    assertContract(
      situation.cancelledBy('opposite_signal'),
      `${label}: SELL não cancelou a entrada viva.`,
    );
  }
  if (action === 'SELL' && situation.hasPosition) {
    assertContract(
      situation.createdExit,
      `${label}: SELL com posição sem venda a mercado para t+1.`,
    );
  }
  if (action === 'BUY') {
    assertContract(
      isBusy !== situation.createdEntry,
      `${label}: BUY ${isBusy ? 'criou entrada ocupado' : 'livre sem entrada'}.`,
    );
  }
  if (action === 'HOLD') assertContract(!situation.createdEntry, `${label}: HOLD criou entrada.`);
}

// `commandId` já processado é ignorado, não reaplicado: a repetição só aparece como `ignored_duplicate`.
function assertCommandIdempotency(entry: TimelineEntry, seen: Set<string>): void {
  for (const command of entry.step.result.decisions.commands) {
    const expected = seen.has(command.commandId) ? 'ignored_duplicate' : 'applied';
    assertContract(
      command.status === expected,
      `Passo ${entry.index}: comando ${command.commandId} ${command.status}, esperado ${expected}.`,
    );
    seen.add(command.commandId);
  }
}

// Tabela de sinais e comandos do ADR 0002 §c, conferida no fechamento de cada candle.
export function checkSignalPolicy(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const seenCommands = new Set<string>();
  for (const entry of timeline.entries) {
    assertCommandIdempotency(entry, seenCommands);
    const signal = entry.step.result.decisions.signal;
    const situation = describeClose(timeline, entry);
    const label = `Passo ${entry.index}`;
    assertCommands(situation, label);
    if (signal !== null) assertSignal(signal.action, situation, label);
  }
}
