// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type OrderEvent } from '../../../packages/strategy-engine/src/index.js';
import { assertContract, type CheckContext } from './engine-contract-types.fixture.js';
import { buildTimeline, type Timeline, type TimelineEntry } from './engine-timeline.fixture.js';
import { marketBuyPrice, sameDecimal, toEngineDecimal } from './reference-pricing.fixture.js';

const TERMINAL_STATUSES: readonly string[] = ['filled', 'expired', 'cancelled', 'rejected'];

export type CreatedOrder = OrderEvent & { readonly createdIndex: number };

export function findTerminal(
  timeline: Timeline,
  orderKey: string,
): { entry: TimelineEntry; event: OrderEvent } | undefined {
  for (const entry of timeline.entries) {
    const event = entry.step.result.decisions.orders.find(
      (order) => order.orderKey === orderKey && TERMINAL_STATUSES.includes(order.status),
    );
    if (event !== undefined) return { entry, event };
  }
  return undefined;
}

// Melhora de preço só no primeiro candle elegível; depois, abertura abaixo de L preenche a L.
function assertLimitFillPrice(
  timeline: Timeline,
  entry: TimelineEntry,
  order: CreatedOrder,
  age: number,
): void {
  const fill = entry.step.result.decisions.fills.find(
    (candidate) => candidate.orderKey === order.orderKey,
  );
  const limit = toEngineDecimal(order.limitPrice ?? '0');
  const { open, low } = entry.step.candle;
  const label = `Ordem ${order.orderKey}`;
  if (toEngineDecimal(open).lte(limit)) {
    const improved = EngineDecimal.min(limit, marketBuyPrice(open, timeline.run));
    const expected = age === 1 ? improved : limit;
    assertContract(
      sameDecimal(fill?.price ?? '-1', expected),
      `${label}: abertura abaixo do limite preenche a ${expected.toFixed()} (candle ${age} da validade).`,
    );
    return;
  }
  assertContract(
    toEngineDecimal(low).lessThan(limit),
    `${label}: preenchida sem o candle cruzar o limite.`,
  );
  assertContract(
    sameDecimal(fill?.price ?? '-1', limit),
    `${label}: preenchida fora do preço limite.`,
  );
}

function assertLimitLifecycle(timeline: Timeline, order: CreatedOrder): void {
  const eligible = order.eligibleCandles ?? 0;
  const terminal = findTerminal(timeline, order.orderKey);
  const label = `Ordem ${order.orderKey}`;
  if (terminal === undefined) {
    assertContract(
      order.createdIndex + eligible > timeline.entries.length - 1,
      `${label}: viva depois da validade.`,
    );
    return;
  }
  const age = terminal.entry.index - order.createdIndex;
  if (terminal.event.status === 'expired') {
    assertContract(age === eligible, `${label}: expirou com ${age} candles, validade ${eligible}.`);
    return;
  }
  assertContract(
    age >= 1 && age <= eligible,
    `${label}: ${terminal.event.status} com ${age} candles, validade ${eligible}.`,
  );
  if (terminal.event.status === 'filled')
    assertLimitFillPrice(timeline, terminal.entry, order, age);
}

export function checkLimitOrders(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  for (const order of timeline.createdOrders.values()) {
    if (order.type === 'limit' && order.status === 'created') assertLimitLifecycle(timeline, order);
  }
}
