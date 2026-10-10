// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type OrderEvent } from '../../../packages/strategy-engine/src/index.js';
import {
  assertContract,
  ENGINE_EVENT_KIND,
  type CheckContext,
  type EngineEventKind,
} from './engine-contract-types.fixture.js';
import {
  buildTimeline,
  orderOf,
  positionsDuring,
  type Timeline,
  type TimelineEntry,
} from './engine-timeline.fixture.js';
import { marketBuyPrice, sameDecimal, toEngineDecimal } from './reference-pricing.fixture.js';

const TERMINAL_STATUSES: readonly string[] = ['filled', 'expired', 'cancelled', 'rejected'];

type CreatedOrder = OrderEvent & { readonly createdIndex: number };

function findTerminal(
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

function assertLimitFillPrice(timeline: Timeline, entry: TimelineEntry, order: CreatedOrder): void {
  const fill = entry.step.result.decisions.fills.find(
    (candidate) => candidate.orderKey === order.orderKey,
  );
  const limit = toEngineDecimal(order.limitPrice ?? '0');
  const { open, low } = entry.step.candle;
  const label = `Ordem ${order.orderKey}`;
  if (toEngineDecimal(open).lte(limit)) {
    const expected = EngineDecimal.min(limit, marketBuyPrice(open, timeline.execution));
    assertContract(
      sameDecimal(fill?.price ?? '-1', expected),
      `${label}: gap abaixo do limite preenche na abertura.`,
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
  if (terminal.event.status === 'filled') assertLimitFillPrice(timeline, terminal.entry, order);
}

export function checkLimitOrders(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  for (const order of timeline.createdOrders.values()) {
    if (order.type === 'limit' && order.status === 'created') assertLimitLifecycle(timeline, order);
  }
}

function classifyFills(
  timeline: Timeline,
  entry: TimelineEntry,
  found: Set<EngineEventKind>,
): void {
  for (const fill of entry.step.result.decisions.fills) {
    const order = orderOf(timeline, fill);
    if (fill.side !== 'buy' || order === undefined) continue;
    if (order.type === 'market') found.add(ENGINE_EVENT_KIND.MARKET_ENTRY_FILL);
    if (order.type !== 'limit') continue;
    const isAtOpen = toEngineDecimal(entry.step.candle.open).lte(order.limitPrice ?? '0');
    found.add(
      isAtOpen
        ? ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_AT_OPEN
        : ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_INTRA_CANDLE,
    );
  }
}

function classifyExits(entry: TimelineEntry, found: Set<EngineEventKind>): void {
  const { candle } = entry.step;
  for (const closed of entry.step.result.decisions.closedPositions) {
    const position = positionsDuring(entry).find(
      (candidate) => candidate.positionKey === closed.positionKey,
    );
    if (closed.exitReason === 'target') found.add(ENGINE_EVENT_KIND.TARGET_EXIT);
    if (closed.exitReason !== 'stop' || position === undefined) continue;
    if (toEngineDecimal(candle.high).greaterThan(position.targetPrice))
      found.add(ENGINE_EVENT_KIND.STOP_EXIT_WITH_TARGET_TOUCHED);
    if (
      position.candleOpenTime < candle.openTime &&
      toEngineDecimal(candle.open).lte(position.stopPrice)
    ) {
      found.add(ENGINE_EVENT_KIND.STOP_EXIT_ON_GAP);
    }
  }
}

export function classifyEvents(context: CheckContext): ReadonlySet<EngineEventKind> {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const found = new Set<EngineEventKind>();
  for (const entry of timeline.entries) {
    classifyFills(timeline, entry, found);
    classifyExits(entry, found);
    const { decisions } = entry.step.result;
    if (decisions.orders.some((order) => order.status === 'expired'))
      found.add(ENGINE_EVENT_KIND.LIMIT_EXPIRED);
    const isHolding = entry.step.result.state.position !== null;
    if (decisions.signal?.action === 'BUY' && isHolding)
      found.add(ENGINE_EVENT_KIND.BUY_SIGNAL_WHILE_POSITION_OPEN);
  }
  return found;
}

export function checkRequiredEvents(context: CheckContext): void {
  const found = classifyEvents(context);
  const missing = context.scenario.requiredEvents.filter((kind) => !found.has(kind));
  assertContract(missing.length === 0, `Cenário não exercitou: ${missing.join(', ')}.`);
}
