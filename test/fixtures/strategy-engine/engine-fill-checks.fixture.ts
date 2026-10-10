// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type ClosedPositionDecision,
  type EngineDecimalValue,
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
  stopExitPrice,
  stepDown,
  tickDown,
  tickUp,
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

// Stop e alvo nascem do PREÇO DE PREENCHIMENTO com as distâncias do ATR de `t` gravadas na ordem.
export function checkProtectivePrices(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  for (const entry of timeline.entries) {
    for (const opened of entry.step.result.decisions.openedPositions) {
      const fill = entryFillOf(entry, opened.positionKey);
      const order = fill === undefined ? undefined : orderOf(timeline, fill);
      const label = `Passo ${entry.index}, ${opened.positionKey}`;
      assertContract(
        order !== undefined && order.stopDistance !== null && order.targetDistance !== null,
        `${label}: entrada sem distâncias de stop e alvo.`,
      );
      const price = toEngineDecimal(opened.entryPrice);
      const stop = tickDown(price.minus(order?.stopDistance ?? '0'), timeline.run);
      const target = tickUp(price.plus(order?.targetDistance ?? '0'), timeline.run);
      assertContract(
        sameDecimal(opened.stopPrice, stop),
        `${label}: stop fora do preço de preenchimento.`,
      );
      assertContract(
        sameDecimal(opened.targetPrice, target),
        `${label}: alvo fora do preço de preenchimento.`,
      );
    }
  }
}

type CashLedger = { cash: EngineDecimalValue; quantity: EngineDecimalValue };

function applyFill(ledger: CashLedger, fill: FillDecision, timeline: Timeline): void {
  const notional = toEngineDecimal(fill.notional);
  const isBuy = fill.side === 'buy';
  ledger.cash = isBuy
    ? ledger.cash.minus(buyDebit(notional, timeline.run))
    : ledger.cash.plus(sellCredit(notional, timeline.run));
  ledger.quantity = isBuy
    ? ledger.quantity.plus(fill.quantity)
    : ledger.quantity.minus(fill.quantity);
}

function isStopWithoutGap(
  entry: TimelineEntry,
  closed: ClosedPositionDecision,
  stop: string,
): boolean {
  return closed.exitReason === 'stop' && toEngineDecimal(entry.step.candle.open).greaterThan(stop);
}

// R3: a quantidade de uma entrada nunca passa da participação máxima no volume do candle de DECISÃO
// (`t`, o da criação da ordem). O volume do candle de preenchimento é desconhecido na abertura.
function assertVolumeShare(timeline: Timeline, entry: TimelineEntry, fill: FillDecision): void {
  const order = orderOf(timeline, fill);
  if (fill.side !== 'buy' || order === undefined) return;
  const decision = timeline.entries.find(
    (candidate) => candidate.step.candle.openTime === order.createdCandleOpenTime,
  );
  const allowed = stepDown(
    toEngineDecimal(decision?.step.candle.volume ?? '0').times(timeline.run.maxVolumeShare),
    timeline.run,
  );
  assertContract(
    toEngineDecimal(fill.quantity).lte(allowed),
    `Passo ${entry.index}: quantidade ${fill.quantity} passa da participação no volume do candle de decisão (${allowed.toFixed()}).`,
  );
}

// RF05: a perda realizada no stop sem gap (com taxas e slippage de saída) nunca passa de
// riskPerTrade × saldo da decisão. Gap além do stop fica fora de "até o stop".
export function checkRealizedRisk(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const riskPerTrade = toEngineDecimal(context.scenario.strategy.config.risk.riskPerTrade);
  const ledger: CashLedger = {
    cash: toEngineDecimal(timeline.run.initialBalance),
    quantity: new EngineDecimal(0),
  };
  const cashAtEntry = new Map<string, EngineDecimalValue>();
  const stops = new Map<string, string>();
  for (const entry of timeline.entries) {
    for (const fill of entry.step.result.decisions.fills) {
      assertVolumeShare(timeline, entry, fill);
      if (fill.side === 'buy') cashAtEntry.set(fill.positionKey, ledger.cash);
      applyFill(ledger, fill, timeline);
    }
    for (const opened of entry.step.result.decisions.openedPositions)
      stops.set(opened.positionKey, opened.stopPrice);
    for (const closed of entry.step.result.decisions.closedPositions) {
      const stop = stops.get(closed.positionKey) ?? '0';
      if (!isStopWithoutGap(entry, closed, stop)) continue;
      const allowed = (cashAtEntry.get(closed.positionKey) ?? new EngineDecimal(0)).times(
        riskPerTrade,
      );
      const loss = toEngineDecimal(closed.netProfit).negated();
      assertContract(
        loss.lte(allowed),
        `Passo ${entry.index}: perda no stop ${loss.toFixed()} passa de ${allowed.toFixed()} (RF05).`,
      );
    }
  }
}

function assertFillArithmetic(timeline: Timeline, entry: TimelineEntry, fill: FillDecision): void {
  const { run } = timeline;
  const notional = toEngineDecimal(fill.price).times(fill.quantity);
  assertContract(
    sameDecimal(fill.notional, notional),
    `Passo ${entry.index}: valor ≠ preço × quantidade.`,
  );
  assertContract(
    sameDecimal(fill.fee, feeOf(notional, run)),
    `Passo ${entry.index}: taxa fora da fórmula.`,
  );
  if (orderOf(timeline, fill)?.type !== 'market') return;
  const { open } = entry.step.candle;
  const expected = fill.side === 'buy' ? marketBuyPrice(open, run) : marketSellPrice(open, run);
  assertContract(
    sameDecimal(fill.price, expected),
    `Passo ${entry.index}: preço a mercado sem slippage na abertura.`,
  );
}

export function checkFeesAndSlippage(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
  const { run } = timeline;
  const ledger: CashLedger = {
    cash: toEngineDecimal(run.initialBalance),
    quantity: new EngineDecimal(0),
  };
  for (const entry of timeline.entries) {
    for (const fill of entry.step.result.decisions.fills) {
      assertFillArithmetic(timeline, entry, fill);
      applyFill(ledger, fill, timeline);
    }
    const point = entry.step.result.decisions.equityPoint;
    if (point === null) continue;
    const { close, low } = entry.step.candle;
    const atClose = ledger.cash.plus(
      liquidationValue({ quantity: ledger.quantity, price: close, run }),
    );
    const atLow = ledger.cash.plus(
      liquidationValue({ quantity: ledger.quantity, price: low, run }),
    );
    assertContract(
      sameDecimal(point.equity, atClose) && sameDecimal(point.equityAtLow, atLow),
      `Passo ${entry.index}: patrimônio (fechamento ou mínima) não reconcilia com caixa e taxas.`,
    );
  }
}

function closedIn(entry: TimelineEntry, positionKey: string): ClosedPositionDecision | undefined {
  return entry.step.result.decisions.closedPositions.find(
    (closed) => closed.positionKey === positionKey,
  );
}

export function isIntraCandleLimitEntry(
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

// Stop sai a tickDown(min(stop, abertura) × (1 − s)) em qualquer candle; alvo sempre ao preço do alvo
// (inclusive no gap acima dele: a ordem de alvo está no livro).
export function checkGapBeyondStop(context: CheckContext): void {
  const timeline = buildTimeline(context.scenario, context.baseline);
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
      const expected = stopExitPrice(position.stopPrice, candle.open, timeline.run);
      assertContract(
        sameDecimal(closed.exitPrice, expected),
        `Passo ${entry.index}: saída no stop fora da fórmula (gap preenche na abertura).`,
      );
    }
  }
}
