// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeNextTriggers,
  REGIME_ADX_INDICATOR_ID,
  REGIME_FILTER_KIND,
  RISK_ATR_INDICATOR_ID,
  RULE_KIND,
  ruleIndicatorId,
  type IndicatorValue,
  type NextTriggers,
  type RuleReading,
  type ScoreboardReadings,
  type SentimentObservation,
  type StrategyConfig,
  type TriggerState,
} from '@ativada/strategy-engine';

// O que uma linha de `signals` guarda e o gatilho lê: `indicators` e `sentiment_observation` (jsonb, ainda sem tipo).
export type StoredSignalReadings = {
  readonly indicators: unknown;
  readonly sentimentObservation: unknown;
};

export type BuildStoredReadingsParams = {
  readonly config: StrategyConfig;
  readonly latest: StoredSignalReadings;
  // A linha decidida imediatamente antes da última (o candle anterior processado); ausente na primeira decisão.
  readonly previous: StoredSignalReadings | undefined;
};

export const STORED_READINGS_STATUS = {
  READY: 'ready',
  NEEDS_PREVIOUS: 'needs_previous',
} as const;

export type StoredReadings =
  | {
      readonly status: typeof STORED_READINGS_STATUS.READY;
      readonly readings: ScoreboardReadings;
      readonly sentiment: SentimentObservation | undefined;
    }
  | { readonly status: typeof STORED_READINGS_STATUS.NEEDS_PREVIOUS };

export type IndicatorRecord = Readonly<Record<string, number | null>>;

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Só número finito vale; `null` (sentimento sem leitura) e qualquer outra coisa viram ausência.
export function readIndicatorRecord(value: unknown): IndicatorRecord {
  if (!isPlainRecord(value)) return {};
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(entries);
}

// O inverso de `flattenIndicatorValue`: `<id>` é a saída única; `<id>.<saída>` remonta o registro de várias saídas.
export function unflattenIndicator(
  record: IndicatorRecord,
  indicatorId: string,
): IndicatorValue | undefined {
  const scalar = record[indicatorId];
  if (typeof scalar === 'number') return scalar;
  const prefix = `${indicatorId}.`;
  const outputs = Object.entries(record).filter(
    (entry): entry is [string, number] =>
      entry[0].startsWith(prefix) && typeof entry[1] === 'number',
  );
  if (outputs.length === 0) return undefined;
  return Object.fromEntries(outputs.map(([key, value]) => [key.slice(prefix.length), value]));
}

function readSentiment(value: unknown): SentimentObservation | undefined {
  if (!isPlainRecord(value)) return undefined;
  const { value: index, observedAt, source } = value;
  if (typeof index !== 'number' || typeof observedAt !== 'number' || typeof source !== 'string') {
    return undefined;
  }
  return { value: index, observedAt, source };
}

function buildRuleReadings(params: {
  readonly config: StrategyConfig;
  readonly latest: IndicatorRecord;
  readonly previous: IndicatorRecord | undefined;
}): Readonly<Record<string, RuleReading>> | undefined {
  const rules: Record<string, RuleReading> = {};
  for (const rule of params.config.rules) {
    if (rule.kind === RULE_KIND.FEAR_GREED) continue;
    const id = ruleIndicatorId(rule.id);
    const current = unflattenIndicator(params.latest, id);
    if (rule.kind !== RULE_KIND.DONCHIAN_BREAKOUT) {
      rules[rule.id] = { current, previous: undefined };
      continue;
    }
    if (params.previous === undefined) return undefined;
    rules[rule.id] = { current, previous: unflattenIndicator(params.previous, id) };
  }
  return rules;
}

// As leituras que o placar viu na última vela decidida, remontadas do que ficou GRAVADO (ADR 0002, "Acompanhamento ao
// vivo (spec 008)", L3): sem reler velas nem reexecutar o motor. O rompimento de Donchian lê o canal da vela anterior
// processada, que só a linha anterior tem: sem ela, `needs_previous`.
export function buildStoredReadings(params: BuildStoredReadingsParams): StoredReadings {
  const { config } = params;
  const latest = readIndicatorRecord(params.latest.indicators);
  const previous =
    params.previous === undefined ? undefined : readIndicatorRecord(params.previous.indicators);
  const rules = buildRuleReadings({ config, latest, previous });
  if (rules === undefined) return { status: STORED_READINGS_STATUS.NEEDS_PREVIOUS };
  const adx =
    config.regime.kind === REGIME_FILTER_KIND.ADX
      ? unflattenIndicator(latest, REGIME_ADX_INDICATOR_ID)
      : undefined;
  return {
    status: STORED_READINGS_STATUS.READY,
    readings: { rules, atr: unflattenIndicator(latest, RISK_ATR_INDICATOR_ID), adx },
    sentiment: readSentiment(params.latest.sentimentObservation),
  };
}

export type ComputeStoredTriggersParams = BuildStoredReadingsParams & {
  readonly market: {
    // `candles.close` e `candles.close_time` da vela da última linha: o mesmo `closeTime` que o motor recebeu (L1).
    readonly close: string;
    readonly closeTime: number;
    readonly sentimentSource: string;
  };
  readonly state: TriggerState;
};

export type StoredTriggers =
  | { readonly status: typeof STORED_READINGS_STATUS.READY; readonly triggers: NextTriggers }
  | { readonly status: typeof STORED_READINGS_STATUS.NEEDS_PREVIOUS };

// O que falta para a regra votar, das leituras GRAVADAS: monta as leituras e chama o `computeNextTriggers` puro (a
// paridade com o recálculo sobre a série está provada em `live-stored-readings-parity.contract.test.ts`).
export function computeStoredTriggers(params: ComputeStoredTriggersParams): StoredTriggers {
  const { config, market, state } = params;
  const stored = buildStoredReadings(params);
  if (stored.status === STORED_READINGS_STATUS.NEEDS_PREVIOUS) return stored;
  return {
    status: STORED_READINGS_STATUS.READY,
    triggers: computeNextTriggers({
      config,
      readings: stored.readings,
      close: market.close,
      closeTime: market.closeTime,
      sentiment: stored.sentiment,
      sentimentSource: market.sentimentSource,
      state,
    }),
  };
}
