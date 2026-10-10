// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertContract, type CheckContext } from './engine-contract-types.fixture.js';
import { stateBefore } from './engine-contract-checks.fixture.js';
import { buildTimeline, type TimelineEntry } from './engine-timeline.fixture.js';
import { sameDecimal, stopExitPrice } from './reference-pricing.fixture.js';

function assertPositionClosedByGap(entry: TimelineEntry, stop: string, run: CheckContext): void {
  const { candle, result } = entry.step;
  const label = `Passo ${entry.index} (lacuna)`;
  const closed = result.decisions.closedPositions;
  assertContract(closed.length === 1, `${label}: a posição aberta não saiu.`);
  assertContract(closed[0]?.exitReason === 'gap', `${label}: a saída não tem o motivo gap.`);
  const expected = stopExitPrice(stop, candle.open, run.scenario.run.parameters);
  assertContract(
    sameDecimal(closed[0]?.exitPrice ?? '-1', expected),
    `${label}: a saída fora de min(stop, abertura) × (1 − slippage).`,
  );
  assertContract(result.state.wallet.position === null, `${label}: a posição seguiu aberta.`);
}

function assertPendingCancelled(entry: TimelineEntry, orderKey: string): void {
  const label = `Passo ${entry.index} (lacuna)`;
  const cancelled = entry.step.result.decisions.orders.some(
    (order) =>
      order.orderKey === orderKey && order.status === 'cancelled' && order.reason === 'gap',
  );
  assertContract(cancelled, `${label}: a ordem pendente ${orderKey} não caducou com motivo gap.`);
  assertContract(
    entry.step.result.state.wallet.pendingOrder === null,
    `${label}: a ordem pendente seguiu viva.`,
  );
}

// Lacuna confirmada (ADR 0002 §e): a posição aberta sai na abertura (stop assumido tocado), as ordens
// pendentes caducam com motivo `gap` e nenhuma entrada nasce nesse candle.
export function checkGapPolicy(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  for (const entry of timeline.entries) {
    if (entry.step.confirmedGapCandles === 0) continue;
    const before = stateBefore(context, entry.index).wallet;
    if (before.position !== null) {
      assertPositionClosedByGap(entry, before.position.stopPrice, context);
    }
    if (before.pendingOrder !== null) assertPendingCancelled(entry, before.pendingOrder.orderKey);
    const createsEntry = entry.step.result.decisions.orders.some(
      (order) => order.status === 'created' && order.purpose === 'entry',
    );
    assertContract(
      !createsEntry,
      `Passo ${entry.index} (lacuna): criou entrada no candle da lacuna.`,
    );
  }
}
