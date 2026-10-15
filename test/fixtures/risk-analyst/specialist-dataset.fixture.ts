// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategySignalState,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  signalStep,
  type SentimentObservation,
  type StrategyVersion,
} from '../../../packages/strategy-engine/src/index.js';
import {
  CLASSIC_STRATEGY,
  type RealDataset,
} from '../strategy-engine/signal/classic-signals.fixture.js';
import type { AuditorCandle, AuditorVote, AuditorWindow } from './auditor-oracle.fixture.js';
import {
  ORACLE_SPECIALIST_CONFIGS,
  ORACLE_SPECIALIST_KEYS,
  type OracleSpecialistKey,
} from './specialist-catalog.fixture.js';

// Os votos que o oráculo recebe: o `signalStep` de PRODUÇÃO de cada especialista (RF03, nenhum indicador reimplementado)
// sobre os dois conjuntos reais do motor, tratando a vela deles como a base (plan D11). A tendência da estratégia é o
// Placar clássico (o mesmo sinal da `projection-1` da spec 009).

const DAY = 86_400_000;

export const AUDITED_KEYS = [...ORACLE_SPECIALIST_KEYS, 'strategy'] as const;
export type AuditedKey = (typeof AUDITED_KEYS)[number];

export function specialistVersion(key: OracleSpecialistKey): StrategyVersion {
  return createStrategyVersion(ORACLE_SPECIALIST_CONFIGS[key]);
}

function auditedVersion(key: AuditedKey): StrategyVersion {
  return key === 'strategy' ? CLASSIC_STRATEGY : specialistVersion(key);
}

// Fear & Greed sintético e determinístico (os conjuntos reais não trazem sentimento): uma leitura por dia UTC, disponível à
// 00:00, com valor (37·dia + 11) mod 101, que passa por medo (≤ 25), neutro e ganância (≥ 75).
export function syntheticSentiment(closeTime: number, source: string): SentimentObservation {
  const day = Math.floor(closeTime / DAY);
  return { value: (day * 37 + 11) % 101, observedAt: day * DAY, source };
}

function voteOf(score: string): AuditorVote {
  if (score.startsWith('-')) return -1;
  return /^0(\.0*)?$/.test(score) ? 0 : 1;
}

export function buildAuditorSeries(dataset: RealDataset, key: AuditedKey): AuditorCandle[] {
  const strategy = auditedVersion(key);
  let state = createStrategySignalState(strategy.config);
  return dataset.candles.map((candle) => {
    const sentiment = syntheticSentiment(candle.closeTime, dataset.market.sentimentSource);
    const stepped = signalStep({ strategy, market: dataset.market, state, candle, sentiment });
    state = stepped.state;
    const vote = stepped.signal === null ? null : voteOf(stepped.signal.score);
    return { openTime: candle.openTime, close: candle.close, vote };
  });
}

// A janela da decisão na ÚLTIMA vela do conjunto.
export function lastCandleWindow(dataset: RealDataset, windowCandles: number): AuditorWindow {
  const last = dataset.candles.at(-1);
  if (last === undefined) throw new Error('conjunto real vazio');
  return {
    decisionTime: last.openTime,
    timeframeMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[dataset.market.timeframe],
    windowCandles,
  };
}

export function leadInOf(key: OracleSpecialistKey): number {
  return createStrategySignalState(specialistVersion(key).config).leadInCandles;
}
