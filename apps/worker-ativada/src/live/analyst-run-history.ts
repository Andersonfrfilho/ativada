// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CANDLE_MILLISECONDS, type AnalystPosition, type VoteReading } from '@ativada/risk-analyst';
import type { AnalystHistory } from '@ativada/database';
import type { EngineCandle, StepDecisions } from '@ativada/strategy-engine';

import { AnalystFailure } from './analyst-failure.js';
import { ANALYST_FAILURE_CODE, ANALYST_HISTORY_LOOKBACK_CANDLES } from './analyst-live.constant.js';
import type { LiveRunSession } from './live-run.types.js';

// O que a regra lê da PRÓPRIA simulação (placar, patrimônio e posições). Nasce do banco uma vez por ronda e cresce com os
// passos desta ronda: o estado da simulação continua só no checkpoint (nada daqui sobrevive a uma ronda).
export type AnalystRunHistory = {
  // Registra o que o passo do candle produziu; vale para cada passo, mesmo quando a decisão do analista falha.
  readonly record: (candle: EngineCandle, decisions: StepDecisions) => void;
  readonly seed: (candleTime: number) => Promise<void>;
  readonly equityAt: (candleTime: number) => string | undefined;
  readonly positions: () => readonly AnalystPosition[];
  // O voto da tendência da estratégia em cada vela da série (A4): sem linha de sinal, sem leitura.
  readonly strategyVotes: (candles: readonly EngineCandle[]) => readonly VoteReading[];
};

type Stored = {
  readonly scores: Map<number, string>;
  readonly equities: Map<number, string>;
  readonly positions: Map<string, AnalystPosition>;
};

function voteOfScore(score: string): VoteReading['vote'] {
  if (/^-?0(\.0*)?$/.test(score)) return 0;
  return score.startsWith('-') ? -1 : 1;
}

function recordInto(stored: Stored, candle: EngineCandle, decisions: StepDecisions): void {
  if (decisions.signal !== null) stored.scores.set(candle.openTime, decisions.signal.score);
  if (decisions.equityPoint !== null) {
    stored.equities.set(decisions.equityPoint.candleOpenTime, decisions.equityPoint.equity);
  }
  for (const opened of decisions.openedPositions) {
    stored.positions.set(opened.positionKey, {
      openedCandleTime: opened.candleOpenTime,
      closedCandleTime: null,
      netProfit: null,
    });
  }
  for (const closed of decisions.closedPositions) {
    stored.positions.set(closed.positionKey, {
      openedCandleTime: closed.openedCandleOpenTime,
      closedCandleTime: closed.candleOpenTime,
      netProfit: closed.netProfit,
    });
  }
}

// O que já está em memória é mais novo que o banco: a leitura só preenche o que falta.
function seedInto(stored: Stored, history: AnalystHistory): void {
  for (const row of history.scores) {
    if (!stored.scores.has(row.candleTime)) stored.scores.set(row.candleTime, row.score);
  }
  for (const row of history.equities) {
    if (!stored.equities.has(row.candleTime)) stored.equities.set(row.candleTime, row.equity);
  }
  for (const row of history.positions) {
    if (stored.positions.has(row.engineKey)) continue;
    stored.positions.set(row.engineKey, {
      openedCandleTime: row.openedCandleTime,
      closedCandleTime: row.closedCandleTime,
      netProfit: row.netProfit,
    });
  }
}

export function createAnalystRunHistory(
  session: Pick<LiveRunSession, 'readAnalystHistory'>,
): AnalystRunHistory {
  const stored: Stored = { scores: new Map(), equities: new Map(), positions: new Map() };
  let isSeeded = false;
  return {
    record: (candle, decisions): void => recordInto(stored, candle, decisions),
    seed: async (candleTime): Promise<void> => {
      if (isSeeded) return;
      const fromCandleTime = candleTime - ANALYST_HISTORY_LOOKBACK_CANDLES * CANDLE_MILLISECONDS;
      try {
        seedInto(stored, await session.readAnalystHistory({ fromCandleTime }));
      } catch {
        throw new AnalystFailure(ANALYST_FAILURE_CODE.SERIES_UNAVAILABLE);
      }
      isSeeded = true;
    },
    equityAt: (candleTime) => stored.equities.get(candleTime),
    positions: () => [...stored.positions.values()],
    strategyVotes: (candles) =>
      candles.map((candle) => {
        const score = stored.scores.get(candle.openTime);
        return {
          openTime: candle.openTime,
          close: candle.close,
          vote: score === undefined ? null : voteOfScore(score),
          isMissing: false,
          atr: null,
        };
      }),
  };
}
