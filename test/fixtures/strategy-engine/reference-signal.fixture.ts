// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertSignalStepInput,
  computeLeadInCandles,
  formatEngineDecimal,
  REGIME,
  resolveFreshSentiment,
  RISK_ATR_INDICATOR_ID,
  SIGNAL_ACTION,
  STRATEGY_FAMILY,
  toEngineDecimal,
  type EngineCandle,
  type JsonValue,
  type SentimentObservation,
  type SignalAction,
  type SignalDecision,
  type SignalState,
  type SignalStepInput,
  type SignalStepResult,
  type SignalVote,
  type StrategyConfig,
} from '../../../packages/strategy-engine/src/index.js';
import {
  guardInput,
  REFERENCE_ENGINE_DEFECT,
  type ReferenceEngineDefect,
} from './reference-engine-defect.fixture.js';

// Regra da referência, deliberadamente simples e causal: compra em todo fechamento; vende quando o
// candle cai 3% ou mais da abertura; "ganância" (Fear & Greed fresco ≥ 80) segura a compra.
const SELL_WHEN_CLOSE_AT_OR_BELOW = '0.97';
export const GREED_BLOCKS_BUY_AT = 80;
const PEEK_KEY = 'defect:peek';
const PREVIOUS_KEY = 'defect:previous';
const CACHE_KEY = 'defect:cache';
const ALWAYS_LONG_RULE = 'always-long';
const GREED_RULE = 'greed-filter';
const RULE_LABEL: Readonly<Record<string, string>> = {
  [ALWAYS_LONG_RULE]: 'sempre comprado',
  [GREED_RULE]: 'Fear & Greed',
};
const ACTION_LABEL: Readonly<Record<SignalAction, string>> = {
  BUY: 'Compra',
  SELL: 'Venda',
  HOLD: 'Neutro',
};

type AtrSnapshot = {
  readonly previousClose: number | null;
  readonly trueRanges: readonly number[];
};

type PreviousCandle = { readonly openTime: number; readonly open: string; readonly close: string };
type PreviousDecision = PreviousCandle & { readonly atr: number | null };

export type SignalContext = {
  readonly config: StrategyConfig;
  readonly configHash: string;
  readonly confirmedGapCandles: number;
  readonly candle: EngineCandle;
  readonly sentiment: SentimentObservation | undefined;
  readonly defect: ReferenceEngineDefect;
  readonly hiddenCandlesSeen: number;
};

// ATR simples (média do true range, janela finita): convergência = aquecimento.
export function referenceLeadInCandles(config: StrategyConfig): number {
  const period = config.risk.atrPeriod;
  return computeLeadInCandles([{ warmupCandles: period, convergenceCandles: period }]);
}

function readIndicator<TValue>(state: SignalState, key: string): TValue | undefined {
  return state.indicators[key] as TValue | undefined;
}

function withIndicator(state: SignalState, key: string, value: unknown): SignalState {
  return { ...state, indicators: { ...state.indicators, [key]: value as JsonValue } };
}

function updateAtr(state: SignalState, context: SignalContext): [SignalState, number | undefined] {
  const period = context.config.risk.atrPeriod;
  const previous = readIndicator<AtrSnapshot>(state, RISK_ATR_INDICATOR_ID) ?? {
    previousClose: null,
    trueRanges: [],
  };
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
  const next = withIndicator(state, RISK_ATR_INDICATOR_ID, snapshot);
  if (trueRanges.length < period) return [next, undefined];
  return [next, trueRanges.reduce((sum, value) => sum + value, 0) / period];
}

function isDrop(candle: PreviousCandle): boolean {
  return toEngineDecimal(candle.close).lte(
    toEngineDecimal(candle.open).times(SELL_WHEN_CLOSE_AT_OR_BELOW),
  );
}

function buildVotes(candle: PreviousCandle, fresh: SentimentObservation | null): SignalVote[] {
  const isGreedy = fresh !== null && fresh.value >= GREED_BLOCKS_BUY_AT;
  return [
    {
      ruleId: ALWAYS_LONG_RULE,
      family: STRATEGY_FAMILY.TREND,
      vote: isDrop(candle) ? -1 : 1,
      weight: '1',
      isMissing: false,
    },
    {
      ruleId: GREED_RULE,
      family: STRATEGY_FAMILY.SENTIMENT,
      vote: isGreedy ? -1 : 0,
      weight: '1',
      isMissing: fresh === null,
    },
  ];
}

function actionOf(votes: readonly SignalVote[], candle: PreviousCandle): SignalAction {
  if (isDrop(candle)) return SIGNAL_ACTION.SELL;
  const score = votes.reduce((sum, vote) => sum + vote.vote, 0);
  return score >= 1 ? SIGNAL_ACTION.BUY : SIGNAL_ACTION.HOLD;
}

function labels(votes: readonly SignalVote[], vote: -1 | 0 | 1): string {
  const names = votes
    .filter((candidate) => candidate.vote === vote && !candidate.isMissing)
    .map((candidate) => RULE_LABEL[candidate.ruleId] ?? candidate.ruleId);
  return names.length === 0 ? 'nenhuma' : names.join(', ');
}

function reasonOf(action: SignalAction, score: number, votes: readonly SignalVote[]): string {
  const signed = score > 0 ? `+${score}` : String(score);
  const missing = votes.filter((vote) => vote.isMissing).map((vote) => RULE_LABEL[vote.ruleId]);
  const segments = [
    ACTION_LABEL[action],
    `pontuação ${signed}`,
    'sem filtro de regime',
    `compra: ${labels(votes, 1)}`,
    `venda: ${labels(votes, -1)}`,
    `neutras: ${labels(votes, 0)}`,
    ...(missing.length === 0 ? [] : [`sem dado: ${missing.join(', ')}`]),
  ];
  return segments.join(' · ');
}

function buildSignal(params: {
  readonly context: SignalContext;
  readonly stamp: number;
  readonly candle: PreviousCandle;
  readonly fresh: SentimentObservation | null;
  readonly atr: number | undefined;
  readonly forcedAction?: SignalAction;
}): SignalDecision {
  const votes = buildVotes(params.candle, params.fresh);
  const action = params.forcedAction ?? actionOf(votes, params.candle);
  const score = votes.reduce((sum, vote) => sum + vote.vote, 0);
  return {
    candleOpenTime: params.stamp,
    configHash: params.context.configHash,
    confirmedGapCandles: params.context.confirmedGapCandles,
    action,
    score: formatEngineDecimal(toEngineDecimal(String(score))),
    regime: REGIME.NONE,
    votes,
    indicators: { [RISK_ATR_INDICATOR_ID]: params.atr ?? null },
    sentiment: params.fresh,
    reason: reasonOf(action, score, votes),
  };
}

// Defeito LOOKS_AT_FUTURE: decide o candle anterior com o fechamento do atual e carimba no passado.
function peekSignal(
  state: SignalState,
  context: SignalContext,
  atr: number | undefined,
): SignalStepResult {
  const peek = readIndicator<{ openTime: number; close: number }>(state, PEEK_KEY);
  const current = { openTime: context.candle.openTime, close: Number(context.candle.close) };
  const next = withIndicator(state, PEEK_KEY, current);
  const isRising = peek !== undefined && current.close > peek.close;
  const signal = buildSignal({
    context,
    stamp: peek?.openTime ?? current.openTime,
    candle: context.candle,
    fresh: null,
    atr,
    forcedAction: isRising ? SIGNAL_ACTION.BUY : SIGNAL_ACTION.HOLD,
  });
  return { state: next, signal };
}

// Defeito SENTIMENT_LOOKAHEAD: reemite o sinal do candle anterior (preços dele) com o sentimento de
// agora, carimbado no passado. Só a perturbação do sentimento futuro muda essa decisão.
function sentimentLookaheadSignal(
  state: SignalState,
  context: SignalContext,
  atr: number | undefined,
): SignalStepResult {
  const { candle } = context;
  const current: PreviousDecision = {
    openTime: candle.openTime,
    open: candle.open,
    close: candle.close,
    atr: atr ?? null,
  };
  const previous = readIndicator<PreviousDecision>(state, PREVIOUS_KEY) ?? current;
  const fresh = resolveFreshSentiment({
    sentiment: context.sentiment,
    closeTime: candle.closeTime,
  });
  const signal = buildSignal({
    context,
    stamp: previous.openTime,
    candle: previous,
    fresh,
    atr: previous.atr ?? undefined,
  });
  return { state: withIndicator(state, PREVIOUS_KEY, current), signal };
}

function decide(
  state: SignalState,
  context: SignalContext,
  atr: number | undefined,
): SignalStepResult {
  if (context.defect === REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE) {
    return peekSignal(state, context, atr);
  }
  if (context.defect === REFERENCE_ENGINE_DEFECT.SENTIMENT_LOOKAHEAD) {
    return sentimentLookaheadSignal(state, context, atr);
  }
  const { candle } = context;
  const fresh = resolveFreshSentiment({
    sentiment: context.sentiment,
    closeTime: candle.closeTime,
  });
  return { state, signal: buildSignal({ context, stamp: candle.openTime, candle, fresh, atr }) };
}

function isTrading(state: SignalState, context: SignalContext): boolean {
  const processed =
    context.defect === REFERENCE_ENGINE_DEFECT.HIDDEN_STATE
      ? context.hiddenCandlesSeen
      : state.processedCandles;
  return processed >= state.leadInCandles;
}

function finishSignalState(state: SignalState, defect: ReferenceEngineDefect): SignalState {
  if (defect !== REFERENCE_ENGINE_DEFECT.NON_SERIALIZABLE_STATE) return state;
  return withIndicator(state, CACHE_KEY, new Map<string, number>());
}

export function runReferenceSignalStep(
  input: SignalStepInput,
  defect: ReferenceEngineDefect,
  hiddenCandlesSeen: number,
): SignalStepResult {
  guardInput(defect, () => assertSignalStepInput(input));
  const context: SignalContext = {
    config: input.strategy.config,
    configHash: input.strategy.configHash,
    confirmedGapCandles: input.confirmedGapCandles ?? 0,
    candle: input.candle,
    sentiment: input.sentiment,
    defect,
    hiddenCandlesSeen,
  };
  const [withAtr, atr] = updateAtr(input.state, context);
  const counted: SignalState = {
    ...withAtr,
    processedCandles: withAtr.processedCandles + 1,
    lastCandleOpenTime: input.candle.openTime,
  };
  if (!isTrading(counted, context)) {
    return { state: finishSignalState(counted, defect), signal: null };
  }
  const decided = decide(counted, context, atr);
  return { state: finishSignalState(decided.state, defect), signal: decided.signal };
}
