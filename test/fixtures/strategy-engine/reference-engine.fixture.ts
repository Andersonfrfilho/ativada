// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertStepInput,
  computeLeadInCandles,
  createInitialEngineState,
  decimalFromIndicator,
  EngineDecimal,
  ENTRY_ORDER_TYPE,
  ORDER_EVENT_REASON,
  ORDER_PURPOSE,
  ORDER_SIDE,
  ORDER_STATUS,
  REGIME,
  SIGNAL_ACTION,
  STRATEGY_FAMILY,
  type Engine,
  type EngineState,
  type EquityPointDecision,
  type JsonValue,
  type PendingOrderState,
  type SignalAction,
  type SignalDecision,
  type StepInput,
  type StepResult,
} from '../../../packages/strategy-engine/src/index.js';
import {
  REFERENCE_ENGINE_DEFECT,
  type ReferenceEngineDefect,
} from './reference-engine-defect.fixture.js';
import {
  evaluateProtectiveExits,
  executePendingOrder,
  openPosition,
  orderEvent,
  takeKey,
  type ReferenceContext,
  type ReferenceDraft,
} from './reference-fills.fixture.js';
import {
  formatEngineDecimal,
  liquidationValue,
  marketBuyPrice,
  moneyDown,
  moneyUp,
  stepDown,
  tickDown,
  toEngineDecimal,
  feeOf,
} from './reference-pricing.fixture.js';

// Referência deliberadamente simples: "sempre comprado" (compra em todo fechamento sem posição), com o
// modelo de preenchimento completo do ADR 0002 §c. Prova o harness; não é o motor da T2.5.
export const REFERENCE_ENGINE_VERSION = 'reference-1';
const ATR_KEY = 'atr';
const PEEK_KEY = 'peek';
const SECOND_ENTRY_KEY = 'secondEntry';

type AtrSnapshot = {
  readonly previousClose: number | null;
  readonly trueRanges: readonly number[];
};

function readAtrSnapshot(state: EngineState): AtrSnapshot {
  const snapshot = state.indicators[ATR_KEY];
  if (snapshot === undefined) return { previousClose: null, trueRanges: [] };
  return snapshot as unknown as AtrSnapshot;
}

// ATR simples (média do true range) só para a referência; o ATR de Wilder é da T2.2.
function updateAtr(draft: ReferenceDraft, context: ReferenceContext): number | undefined {
  const period = context.config.risk.atrPeriod;
  const previous = readAtrSnapshot(draft.state);
  const high = Number(context.candle.high);
  const low = Number(context.candle.low);
  const trueRange =
    previous.previousClose === null
      ? high - low
      : Math.max(
          high - low,
          Math.abs(high - previous.previousClose),
          Math.abs(low - previous.previousClose),
        );
  const trueRanges = [...previous.trueRanges.slice(-(period - 1)), trueRange];
  const snapshot: AtrSnapshot = { previousClose: Number(context.candle.close), trueRanges };
  draft.state = {
    ...draft.state,
    indicators: { ...draft.state.indicators, [ATR_KEY]: snapshot },
  };
  if (trueRanges.length < period) return undefined;
  return trueRanges.reduce((sum, value) => sum + value, 0) / period;
}

function buyBenchmarkWhenTradingStarts(draft: ReferenceDraft, context: ReferenceContext): void {
  const { state } = draft;
  if (state.benchmark !== null || state.processedCandles < state.leadInCandles) return;
  const execution = context.config.execution;
  const initial = toEngineDecimal(execution.initialBalance);
  const price = marketBuyPrice(context.candle.open, execution);
  const budget = moneyDown(initial.dividedBy(new EngineDecimal(1).plus(execution.feeRate)));
  const quantity = stepDown(budget.dividedBy(price), execution);
  const notional = quantity.times(price);
  const cash = initial.minus(moneyUp(notional)).minus(feeOf(notional, execution));
  draft.state = {
    ...state,
    benchmark: { quantity: formatEngineDecimal(quantity), cash: formatEngineDecimal(cash) },
  };
}

function buildEntryOrder(
  draft: ReferenceDraft,
  context: ReferenceContext,
  atr: number,
): PendingOrderState {
  const { config, candle } = context;
  const atrValue = decimalFromIndicator(atr);
  const stopDistance = atrValue.times(config.risk.stopAtrMultiple);
  const cash = toEngineDecimal(draft.state.cash);
  const notionalByRisk = cash
    .times(config.risk.riskPerTrade)
    .dividedBy(stopDistance)
    .times(candle.close);
  const affordable = cash.dividedBy(new EngineDecimal(1).plus(config.execution.feeRate));
  const budget = EngineDecimal.min(
    notionalByRisk,
    cash.times(config.risk.maxExposureRate),
    affordable,
  );
  const isLimit = config.entry.orderType === ENTRY_ORDER_TYPE.LIMIT;
  const offset = config.entry.orderType === ENTRY_ORDER_TYPE.LIMIT ? config.entry.offsetRate : '0';
  const limitPrice = tickDown(
    toEngineDecimal(candle.close).times(new EngineDecimal(1).minus(offset)),
    config.execution,
  );
  return {
    orderKey: takeKey(draft, 'order'),
    side: ORDER_SIDE.BUY,
    type: isLimit ? ENTRY_ORDER_TYPE.LIMIT : ENTRY_ORDER_TYPE.MARKET,
    purpose: ORDER_PURPOSE.ENTRY,
    createdCandleOpenTime: candle.openTime,
    limitPrice: isLimit ? formatEngineDecimal(limitPrice) : null,
    quoteBudget: formatEngineDecimal(moneyDown(budget)),
    stopDistance: formatEngineDecimal(stopDistance),
    targetDistance: formatEngineDecimal(atrValue.times(config.risk.targetAtrMultiple)),
    eligibleCandles:
      config.entry.orderType === ENTRY_ORDER_TYPE.LIMIT ? config.entry.expiryCandles : null,
    exitReason: null,
  };
}

function canPlaceEntry(draft: ReferenceDraft, context: ReferenceContext): boolean {
  const { state } = draft;
  if (state.isHalted || state.pendingOrder !== null) return false;
  return (
    state.position === null || context.defect === REFERENCE_ENGINE_DEFECT.ALLOWS_SECOND_POSITION
  );
}

function placeEntryOrder(
  draft: ReferenceDraft,
  context: ReferenceContext,
  atr: number | undefined,
): void {
  if (!canPlaceEntry(draft, context)) return;
  if (atr === undefined || atr <= 0) {
    const order = { ...buildEntryOrder(draft, context, 1), quoteBudget: null };
    draft.orders.push(
      orderEvent({
        order,
        context,
        status: ORDER_STATUS.REJECTED,
        reason: ORDER_EVENT_REASON.ZERO_ATR,
      }),
    );
    return;
  }
  const order = buildEntryOrder(draft, context, atr);
  draft.orders.push(orderEvent({ order, context, status: ORDER_STATUS.CREATED }));
  if (draft.state.position !== null) {
    const indicators = {
      ...draft.state.indicators,
      [SECOND_ENTRY_KEY]: order as unknown as JsonValue,
    };
    draft.state = { ...draft.state, indicators };
    return;
  }
  if (
    context.defect === REFERENCE_ENGINE_DEFECT.FILLS_AT_DECISION_CLOSE &&
    order.type === ENTRY_ORDER_TYPE.MARKET
  ) {
    const price = marketBuyPrice(context.candle.close, context.config.execution);
    return openPosition(draft, { order, price }, context);
  }
  draft.state = { ...draft.state, pendingOrder: order };
}

// Defeito ALLOWS_SECOND_POSITION: a segunda entrada fica escondida nos indicadores e sobrescreve a posição.
function executeSecondEntry(draft: ReferenceDraft, context: ReferenceContext): void {
  const order = draft.state.indicators[SECOND_ENTRY_KEY];
  if (order === undefined) return;
  const indicators = Object.fromEntries(
    Object.entries(draft.state.indicators).filter(([key]) => key !== SECOND_ENTRY_KEY),
  );
  draft.state = { ...draft.state, indicators };
  const pending = order as unknown as PendingOrderState;
  openPosition(
    draft,
    { order: pending, price: marketBuyPrice(context.candle.open, context.config.execution) },
    context,
  );
}

function lookAheadAction(
  draft: ReferenceDraft,
  context: ReferenceContext,
): { action: SignalAction; stamp: number } {
  const peek = draft.state.indicators[PEEK_KEY] as unknown as
    { openTime: number; close: number } | undefined;
  const current = { openTime: context.candle.openTime, close: Number(context.candle.close) };
  draft.state = { ...draft.state, indicators: { ...draft.state.indicators, [PEEK_KEY]: current } };
  if (peek === undefined) return { action: SIGNAL_ACTION.HOLD, stamp: current.openTime };
  return {
    action: current.close > peek.close ? SIGNAL_ACTION.BUY : SIGNAL_ACTION.HOLD,
    stamp: peek.openTime,
  };
}

function decide(
  draft: ReferenceDraft,
  context: ReferenceContext,
  atr: number | undefined,
): SignalDecision {
  const isPeeking = context.defect === REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE;
  const { action, stamp } = isPeeking
    ? lookAheadAction(draft, context)
    : { action: SIGNAL_ACTION.BUY, stamp: context.candle.openTime };
  if (action === SIGNAL_ACTION.BUY) placeEntryOrder(draft, context, atr);
  const isBuy = action === SIGNAL_ACTION.BUY;
  return {
    candleOpenTime: stamp,
    action,
    score: isBuy ? '1' : '0',
    regime: REGIME.NONE,
    votes: [
      {
        ruleId: 'always-long',
        family: STRATEGY_FAMILY.TREND,
        vote: isBuy ? 1 : 0,
        weight: '1',
        isMissing: false,
      },
    ],
    indicators: { atr: atr ?? null },
    reason: isBuy
      ? 'Compra · pontuação 1 · sem filtro de regime · compra: sempre comprado · venda: nenhuma · neutras: nenhuma'
      : 'Neutro · pontuação 0 · sem filtro de regime · compra: nenhuma · venda: nenhuma · neutras: sempre comprado',
  };
}

function equityPoint(draft: ReferenceDraft, context: ReferenceContext): EquityPointDecision {
  const { state } = draft;
  const execution = context.config.execution;
  const quantity = toEngineDecimal(state.position?.quantity ?? '0');
  const equity = toEngineDecimal(state.cash).plus(
    liquidationValue({ quantity, close: context.candle.close, execution }),
  );
  const benchmark =
    state.benchmark === null
      ? toEngineDecimal(execution.initialBalance)
      : toEngineDecimal(state.benchmark.cash).plus(
          liquidationValue({
            quantity: toEngineDecimal(state.benchmark.quantity),
            close: context.candle.close,
            execution,
          }),
        );
  return {
    candleOpenTime: context.candle.openTime,
    equity: formatEngineDecimal(equity),
    benchmark: formatEngineDecimal(benchmark),
  };
}

function isTrading(
  draft: ReferenceDraft,
  context: ReferenceContext,
  hiddenCandlesSeen: number,
): boolean {
  const processed =
    context.defect === REFERENCE_ENGINE_DEFECT.HIDDEN_STATE
      ? hiddenCandlesSeen
      : draft.state.processedCandles;
  return processed >= draft.state.leadInCandles;
}

function finishState(draft: ReferenceDraft, context: ReferenceContext): EngineState {
  if (context.defect !== REFERENCE_ENGINE_DEFECT.NON_SERIALIZABLE_STATE) return draft.state;
  const indicators = { ...draft.state.indicators, cache: new Map<string, number>() };
  return { ...draft.state, indicators: indicators as unknown as EngineState['indicators'] };
}

function runReferenceStep(
  input: StepInput,
  defect: ReferenceEngineDefect,
  hiddenCandlesSeen: number,
): StepResult {
  assertStepInput({ input, engineVersion: REFERENCE_ENGINE_VERSION });
  if ((input.commands?.length ?? 0) > 0) throw new Error('A referência não implementa comandos.');
  if (defect === REFERENCE_ENGINE_DEFECT.MUTATES_INPUT_STATE)
    Object.assign(input.state, { sequence: input.state.sequence });
  const context: ReferenceContext = { config: input.strategy.config, candle: input.candle, defect };
  const draft: ReferenceDraft = {
    state: input.state,
    orders: [],
    fills: [],
    openedPositions: [],
    closedPositions: [],
    isIntraCandleEntry: false,
  };
  executePendingOrder(draft, context);
  executeSecondEntry(draft, context);
  evaluateProtectiveExits(draft, context);
  buyBenchmarkWhenTradingStarts(draft, context);
  const atr = updateAtr(draft, context);
  draft.state = {
    ...draft.state,
    processedCandles: draft.state.processedCandles + 1,
    lastCandleOpenTime: input.candle.openTime,
  };
  const trading = isTrading(draft, context, hiddenCandlesSeen);
  const signal = trading ? decide(draft, context, atr) : null;
  const equity = trading ? equityPoint(draft, context) : null;
  const { orders, fills, openedPositions, closedPositions } = draft;
  return {
    state: finishState(draft, context),
    decisions: { signal, orders, fills, openedPositions, closedPositions, equityPoint: equity },
  };
}

export function createReferenceEngine(
  defect: ReferenceEngineDefect = REFERENCE_ENGINE_DEFECT.NONE,
): Engine {
  const hiddenCounter = { candlesSeen: 0 };
  return {
    engineVersion: REFERENCE_ENGINE_VERSION,
    createInitialState: (strategy): EngineState =>
      createInitialEngineState({
        strategy,
        engineVersion: REFERENCE_ENGINE_VERSION,
        leadInCandles: computeLeadInCandles(strategy.config.risk.atrPeriod),
      }),
    step: (input): StepResult => {
      hiddenCounter.candlesSeen += 1;
      return runReferenceStep(input, defect, hiddenCounter.candlesSeen);
    },
  };
}
