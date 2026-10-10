// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type ClosedPositionDecision,
  type FillDecision,
  type OpenedPositionDecision,
} from '../../../packages/strategy-engine/src/index.js';
import { assertContract, type CheckContext } from './engine-contract-types.fixture.js';
import {
  buildTimeline,
  entryFillOf,
  isMarketExitAtOpen,
  orderOf,
  positionsDuring,
  type Timeline,
  type TimelineEntry,
} from './engine-timeline.fixture.js';
import {
  buyDebit,
  feeOf,
  liquidationValue,
  marketBuyPrice,
  marketSellPrice,
  sameDecimal,
  sellCredit,
  toEngineDecimal,
} from './reference-pricing.fixture.js';

export function checkSinglePosition(context: CheckContext): void {
  const openKeys = new Set<string>();
  context.baseline.forEach((step, index) => {
    const { openedPositions, closedPositions, orders } = step.result.decisions;
    const opensAnother =
      openedPositions.length > 1 || (openedPositions.length === 1 && openKeys.size > 0);
    assertContract(!opensAnother, `Passo ${index} abriu posição com outra aberta no mesmo par.`);
    for (const opened of openedPositions) openKeys.add(opened.positionKey);
    for (const closed of closedPositions) openKeys.delete(closed.positionKey);
    const createsEntry = orders.some(
      (order) => order.status === 'created' && order.purpose === 'entry',
    );
    assertContract(
      !(createsEntry && openKeys.size > 0),
      `Passo ${index} criou entrada com posição aberta.`,
    );
  });
}

function assertFillArithmetic(timeline: Timeline, entry: TimelineEntry, fill: FillDecision): void {
  const { execution } = timeline;
  const notional = toEngineDecimal(fill.price).times(fill.quantity);
  assertContract(
    sameDecimal(fill.notional, notional),
    `Passo ${entry.index}: valor ≠ preço × quantidade.`,
  );
  assertContract(
    sameDecimal(fill.fee, feeOf(notional, execution)),
    `Passo ${entry.index}: taxa fora da fórmula.`,
  );
  if (orderOf(timeline, fill)?.type !== 'market') return;
  const { open } = entry.step.candle;
  const expected =
    fill.side === 'buy' ? marketBuyPrice(open, execution) : marketSellPrice(open, execution);
  assertContract(
    sameDecimal(fill.price, expected),
    `Passo ${entry.index}: preço a mercado sem slippage na abertura.`,
  );
}

export function checkFeesAndSlippage(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const { execution } = timeline;
  let cash = toEngineDecimal(execution.initialBalance);
  let quantity = new EngineDecimal(0);
  for (const entry of timeline.entries) {
    for (const fill of entry.step.result.decisions.fills) {
      assertFillArithmetic(timeline, entry, fill);
      const notional = toEngineDecimal(fill.notional);
      const isBuy = fill.side === 'buy';
      cash = isBuy
        ? cash.minus(buyDebit(notional, execution))
        : cash.plus(sellCredit(notional, execution));
      quantity = isBuy ? quantity.plus(fill.quantity) : quantity.minus(fill.quantity);
    }
    const point = entry.step.result.decisions.equityPoint;
    if (point === null) continue;
    const expected = cash.plus(
      liquidationValue({ quantity, close: entry.step.candle.close, execution }),
    );
    assertContract(
      sameDecimal(point.equity, expected),
      `Passo ${entry.index}: patrimônio não reconcilia com caixa e taxas.`,
    );
  }
}

function closedIn(entry: TimelineEntry, positionKey: string): ClosedPositionDecision | undefined {
  return entry.step.result.decisions.closedPositions.find(
    (closed) => closed.positionKey === positionKey,
  );
}

function isIntraCandleLimitEntry(
  timeline: Timeline,
  entry: TimelineEntry,
  positionKey: string,
): boolean {
  const fill = entryFillOf(entry, positionKey);
  if (fill === undefined) return false;
  const order = orderOf(timeline, fill);
  if (order?.type !== 'limit' || order.limitPrice === null) return false;
  return toEngineDecimal(entry.step.candle.open).greaterThan(order.limitPrice);
}

function assertTargetExitAllowed(
  timeline: Timeline,
  entry: TimelineEntry,
  position: OpenedPositionDecision,
): void {
  const { candle } = entry.step;
  const isOpenedHere = position.candleOpenTime === candle.openTime;
  assertContract(
    toEngineDecimal(candle.low).greaterThan(position.stopPrice),
    `Passo ${entry.index}: alvo com stop tocado no mesmo candle.`,
  );
  assertContract(
    !(isOpenedHere && isIntraCandleLimitEntry(timeline, entry, position.positionKey)),
    `Passo ${entry.index}: alvo no candle de entrada de uma limitada preenchida no meio do candle.`,
  );
  const passedTarget =
    toEngineDecimal(candle.high).greaterThan(position.targetPrice) ||
    (!isOpenedHere && toEngineDecimal(candle.open).greaterThan(position.targetPrice));
  assertContract(passedTarget, `Passo ${entry.index}: alvo sem o preço passar dele.`);
}

export function checkStopBeforeTarget(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  for (const entry of timeline.entries) {
    for (const position of positionsDuring(entry)) {
      if (isMarketExitAtOpen(timeline, entry, position.positionKey)) continue;
      const closed = closedIn(entry, position.positionKey);
      if (toEngineDecimal(entry.step.candle.low).lte(position.stopPrice)) {
        assertContract(
          closed?.exitReason === 'stop',
          `Passo ${entry.index}: stop tocado e a posição não saiu pelo stop.`,
        );
      }
      if (closed?.exitReason === 'target') assertTargetExitAllowed(timeline, entry, position);
    }
  }
}

export function checkGapBeyondStop(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const { execution } = timeline;
  for (const entry of timeline.entries) {
    const { candle } = entry.step;
    for (const position of positionsDuring(entry)) {
      const closed = closedIn(entry, position.positionKey);
      if (closed?.exitReason === 'target') {
        assertContract(
          sameDecimal(closed.exitPrice, toEngineDecimal(position.targetPrice)),
          `Passo ${entry.index}: alvo fora do preço do alvo.`,
        );
      }
      if (closed?.exitReason !== 'stop') continue;
      const isGap =
        position.candleOpenTime < candle.openTime &&
        toEngineDecimal(candle.open).lte(position.stopPrice);
      const expected = marketSellPrice(isGap ? candle.open : position.stopPrice, execution);
      assertContract(
        sameDecimal(closed.exitPrice, expected),
        `Passo ${entry.index}: saída no stop fora da fórmula (gap preenche na abertura).`,
      );
    }
  }
}
