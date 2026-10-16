// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CoinFlipVerdict } from '@ativada/statistics';

import type { AuditedKey, SpecialistKey } from './analyst.constant.js';

export type AnalystVote = -1 | 0 | 1;

// A vela como a leitura de mercado a vê: preço e volume em texto decimal exato, ordem crescente por abertura.
export type ReadingCandle = {
  readonly openTime: number;
  readonly close: string;
  readonly volume: string;
};

// O voto de UMA regra do especialista naquela vela e a leitura que a frase mostra (RSI ou Fear & Greed; `null` nas demais).
export type RuleVote = {
  readonly ruleId: string;
  readonly vote: AnalystVote;
  readonly reading: number | null;
};

// O voto de UM especialista numa vela. `vote: null` = sem leitura (aquecimento); `isMissing` = o dado da regra faltou
// (sentimento velho) e o motor votou 0; `atr` é a leitura de oscilação do próprio `signalStep` (texto decimal).
export type VoteReading = {
  readonly openTime: number;
  readonly close: string;
  readonly vote: AnalystVote | null;
  readonly isMissing: boolean;
  readonly atr: string | null;
  // Os votos por regra (spec 011, D4-A); ausente em decisão gravada antes deles existirem.
  readonly ruleVotes?: readonly RuleVote[];
};

export type TeamSeries = Readonly<Record<SpecialistKey, readonly VoteReading[]>>;

export type RunCost = { readonly feeRate: string; readonly slippageRate: string };

export type MarketReadings = {
  readonly relativeVolume: string | null;
  readonly atrRate: string | null;
  readonly atrPercentile90: string | null;
  readonly atrPercentile95: string | null;
  readonly momentumShort: string | null;
  readonly momentumLong: string | null;
  readonly roundTripCost: string;
  readonly moveToCost: string | null;
};

export type AuditWindow = {
  readonly decisionTime: number;
  readonly timeframeMilliseconds: number;
  readonly windowCandles: number;
};

// Mesmos campos do oráculo `summarizeAuditor` (test/fixtures/risk-analyst): a paridade é `toStrictEqual`.
export type AuditSummary = {
  readonly predictions: number;
  readonly unread: number;
  readonly noSide: number;
  readonly gap: number;
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly upMoves: number;
  readonly hitRate: string | null;
  readonly upRate: string | null;
  readonly verdict: CoinFlipVerdict;
  readonly lower: string | null;
  readonly upper: string | null;
  readonly weight: string;
};

export type SpecialistView = {
  readonly key: AuditedKey;
  readonly vote: AnalystVote | null;
  readonly isUnread: boolean;
  readonly predictions: number;
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly upMoves: number;
  readonly hitRate: string | null;
  readonly upRate: string | null;
  readonly verdict: CoinFlipVerdict;
  readonly lower: string | null;
  readonly upper: string | null;
  readonly weight: string;
  // Os votos por regra desta vela (D4-A); ausente em decisão gravada antes deles existirem e na linha da estratégia.
  readonly ruleVotes?: readonly RuleVote[];
};
