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
  readonly cancelledBy: (reason: string) => boolean;
  readonly commandKinds: readonly string[];
};

function isCreatedHere(order: OrderEvent, entry: TimelineEntry): boolean {
  return order.createdCandleOpenTime === entry.step.candle.openTime;
}

// Entrada viva no fechamento: criada antes, sem terminal até aqui (ou cancelada neste fechamento).
function hasLiveEntryAtClose(timeline: Timeline, entry: TimelineEntry): boolean {
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
  const isProtective = (order: OrderEvent): boolean =>
    order.type === 'stop' || order.type === 'target';
  return {
    hasLiveEntry: hasLiveEntryAtClose(timeline, entry),
    hasPosition: state.wallet.position !== null,
    isHalted: state.wallet.isHalted,
    createdEntry: createdHere.some((order) => order.purpose === 'entry'),
    createdExit: createdHere.some(
      (order) => order.purpose === 'exit' && !isProtective(order) && order.status === 'created',
    ),
    cancelledBy: (reason) =>
      decisions.orders.some((order) => order.status === 'cancelled' && order.reason === reason),
    commandKinds: decisions.commands.map((command) => command.kind),
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
}

function assertSignal(action: string, situation: CloseSituation, label: string): void {
  const isBusy = situation.hasLiveEntry || situation.hasPosition || situation.isHalted;
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

// Tabela de sinais e comandos do ADR 0002 §c, conferida no fechamento de cada candle.
export function checkSignalPolicy(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  for (const entry of timeline.entries) {
    const signal = entry.step.result.decisions.signal;
    const situation = describeClose(timeline, entry);
    const label = `Passo ${entry.index}`;
    assertCommands(situation, label);
    if (signal !== null) assertSignal(signal.action, situation, label);
  }
}
