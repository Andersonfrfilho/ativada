// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type EngineDecimalValue,
} from '../../../packages/strategy-engine/src/index.js';
import {
  assertContract,
  ENGINE_EVENT_KIND,
  type CheckContext,
  type EngineEventKind,
} from './engine-contract-types.fixture.js';
import { isIntraCandleLimitEntry } from './engine-fill-checks.fixture.js';
import { findTerminal } from './engine-order-checks.fixture.js';
import {
  buildTimeline,
  orderOf,
  positionsDuring,
  type Timeline,
  type TimelineEntry,
} from './engine-timeline.fixture.js';
import { buyDebit, sellCredit, toEngineDecimal } from './reference-pricing.fixture.js';

const GAP_UP_RATE = '1.01';

type Found = Set<EngineEventKind>;

function classifyEntryFills(timeline: Timeline, entry: TimelineEntry, found: Found): void {
  for (const fill of entry.step.result.decisions.fills) {
    const order = orderOf(timeline, fill);
    if (fill.side !== 'buy' || order === undefined) continue;
    const created = timeline.createdOrders.get(fill.orderKey);
    const decisionCandle = timeline.entries[created?.createdIndex ?? 0]?.step.candle;
    if (order.type === 'market') {
      found.add(ENGINE_EVENT_KIND.MARKET_ENTRY_FILL);
      const gapLine = toEngineDecimal(decisionCandle?.close ?? '0').times(GAP_UP_RATE);
      if (toEngineDecimal(entry.step.candle.open).greaterThan(gapLine))
        found.add(ENGINE_EVENT_KIND.GAP_UP_ENTRY);
    }
    if (order.type !== 'limit') continue;
    const isAtOpen = toEngineDecimal(entry.step.candle.open).lte(order.limitPrice ?? '0');
    const age = entry.index - (created?.createdIndex ?? 0);
    if (!isAtOpen) found.add(ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_INTRA_CANDLE);
    else if (age === 1) found.add(ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_AT_OPEN);
    else found.add(ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_AT_LIMIT_ON_LATER_OPEN);
  }
}

function classifyExits(timeline: Timeline, entry: TimelineEntry, found: Found): void {
  const { candle } = entry.step;
  for (const closed of entry.step.result.decisions.closedPositions) {
    const position = positionsDuring(entry).find(
      (candidate) => candidate.positionKey === closed.positionKey,
    );
    if (closed.exitReason === 'signal') found.add(ENGINE_EVENT_KIND.SELL_EXITS_AT_MARKET);
    if (closed.exitReason === 'command') found.add(ENGINE_EVENT_KIND.COMMAND_EXIT);
    if (closed.exitReason === 'gap') found.add(ENGINE_EVENT_KIND.GAP_CLOSES_POSITION);
    if (position === undefined) continue;
    const isCarried = position.candleOpenTime < candle.openTime;
    const open = toEngineDecimal(candle.open);
    if (closed.exitReason === 'target') {
      found.add(ENGINE_EVENT_KIND.TARGET_EXIT);
      if (isCarried && open.greaterThan(position.targetPrice))
        found.add(ENGINE_EVENT_KIND.TARGET_EXIT_ON_GAP);
    }
    if (closed.exitReason !== 'stop') continue;
    if (toEngineDecimal(candle.high).greaterThan(position.targetPrice)) {
      found.add(ENGINE_EVENT_KIND.STOP_EXIT_WITH_TARGET_TOUCHED);
    }
    const isGap = isCarried && open.lte(position.stopPrice);
    found.add(isGap ? ENGINE_EVENT_KIND.STOP_EXIT_ON_GAP : ENGINE_EVENT_KIND.STOP_EXIT_WITHOUT_GAP);
  }
  classifySurvivors(timeline, entry, found);
}

// Posição que atravessou o candle: alvo só tocado (máxima = alvo) ou passado no candle de uma limitada
// preenchida no meio — nos dois casos ela tem de continuar aberta.
function classifySurvivors(timeline: Timeline, entry: TimelineEntry, found: Found): void {
  const closedKeys = new Set(
    entry.step.result.decisions.closedPositions.map((closed) => closed.positionKey),
  );
  const high = toEngineDecimal(entry.step.candle.high);
  for (const position of positionsDuring(entry)) {
    if (closedKeys.has(position.positionKey)) continue;
    if (high.equals(position.targetPrice)) found.add(ENGINE_EVENT_KIND.TARGET_TOUCHED_WITHOUT_EXIT);
    const isIntra = isIntraCandleLimitEntry(timeline, entry, position.positionKey);
    if (isIntra && high.greaterThan(position.targetPrice)) {
      found.add(ENGINE_EVENT_KIND.TARGET_PASSED_ON_INTRA_CANDLE_ENTRY);
    }
  }
}

function classifyLimitTouches(timeline: Timeline, found: Found): void {
  for (const order of timeline.createdOrders.values()) {
    if (order.type !== 'limit' || order.status !== 'created' || order.limitPrice === null) continue;
    const terminal = findTerminal(timeline, order.orderKey);
    const last = terminal?.entry.index ?? timeline.entries.length - 1;
    for (let index = order.createdIndex + 1; index <= last; index += 1) {
      const step = timeline.entries[index]?.step;
      const isFilledHere =
        step?.result.decisions.fills.some((fill) => fill.orderKey === order.orderKey) ?? true;
      const touches = toEngineDecimal(step?.candle.low ?? '0').equals(order.limitPrice);
      if (touches && !isFilledHere) found.add(ENGINE_EVENT_KIND.LIMIT_TOUCHED_WITHOUT_FILL);
    }
  }
}

const REJECTION_EVENT: Readonly<Record<string, EngineEventKind>> = {
  zero_atr: ENGINE_EVENT_KIND.REJECTED_ZERO_ATR,
  below_min_notional: ENGINE_EVENT_KIND.REJECTED_BELOW_MIN_NOTIONAL,
  invalid_stop: ENGINE_EVENT_KIND.REJECTED_INVALID_STOP,
};

function classifyOrders(entry: TimelineEntry, found: Found): void {
  for (const order of entry.step.result.decisions.orders) {
    if (order.status === 'expired') found.add(ENGINE_EVENT_KIND.LIMIT_EXPIRED);
    if (order.status === 'cancelled' && order.reason === 'gap')
      found.add(ENGINE_EVENT_KIND.GAP_CANCELS_PENDING_ORDER);
    if (order.status === 'cancelled' && order.reason === 'opposite_signal')
      found.add(ENGINE_EVENT_KIND.SELL_CANCELS_LIMIT);
    if (order.status === 'filled' && order.reason === 'volume_capped')
      found.add(ENGINE_EVENT_KIND.VOLUME_CAPPED_FILL);
    const rejection = order.status === 'rejected' ? REJECTION_EVENT[order.reason ?? ''] : undefined;
    if (rejection !== undefined) found.add(rejection);
  }
}

function classifySignal(entry: TimelineEntry, found: Found, seenResume: { value: boolean }): void {
  const { decisions, state } = entry.step.result;
  const { signal } = decisions;
  if (decisions.commands.some((command) => command.kind === 'resume')) seenResume.value = true;
  const createdEntry = decisions.orders.some(
    (order) =>
      order.purpose === 'entry' && order.createdCandleOpenTime === entry.step.candle.openTime,
  );
  if (seenResume.value && createdEntry) found.add(ENGINE_EVENT_KIND.RESUME_AFTER_HALT);
  if (signal === null) return;
  const isFree = state.wallet.position === null && state.wallet.pendingOrder === null;
  if (signal.action === 'BUY' && state.wallet.isHalted && isFree)
    found.add(ENGINE_EVENT_KIND.HALT_BLOCKS_ENTRY);
  if (signal.action === 'BUY' && state.wallet.position !== null) {
    found.add(ENGINE_EVENT_KIND.BUY_SIGNAL_WHILE_POSITION_OPEN);
  }
  if (signal.sentiment !== null) found.add(ENGINE_EVENT_KIND.SENTIMENT_USED);
  if (entry.step.sentiment !== undefined && signal.sentiment === null)
    found.add(ENGINE_EVENT_KIND.SENTIMENT_STALE);
}

// Entrada limitada pelo caixa: depois da compra não sobra para mais um passo de quantidade.
function classifyCashBound(timeline: Timeline, found: Found): void {
  let cash: EngineDecimalValue = toEngineDecimal(timeline.run.initialBalance);
  const step = toEngineDecimal(timeline.run.quantityStep);
  for (const entry of timeline.entries) {
    for (const fill of entry.step.result.decisions.fills) {
      const notional = toEngineDecimal(fill.notional);
      cash =
        fill.side === 'buy'
          ? cash.minus(buyDebit(notional, timeline.run))
          : cash.plus(sellCredit(notional, timeline.run));
      const oneMore = buyDebit(step.times(fill.price), timeline.run);
      if (fill.side === 'buy' && cash.lessThan(oneMore) && cash.gte(new EngineDecimal(0))) {
        found.add(ENGINE_EVENT_KIND.CASH_BOUND_ENTRY);
      }
    }
  }
}

export function classifyEvents(context: CheckContext): ReadonlySet<EngineEventKind> {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const found: Found = new Set<EngineEventKind>();
  const seenResume = { value: false };
  for (const entry of timeline.entries) {
    classifyEntryFills(timeline, entry, found);
    classifyExits(timeline, entry, found);
    classifyOrders(entry, found);
    classifySignal(entry, found, seenResume);
  }
  classifyLimitTouches(timeline, found);
  classifyCashBound(timeline, found);
  return found;
}

export function checkRequiredEvents(context: CheckContext): void {
  const found = classifyEvents(context);
  const missing = context.scenario.requiredEvents.filter((kind) => !found.has(kind));
  assertContract(missing.length === 0, `Cenário não exercitou: ${missing.join(', ')}.`);
}
