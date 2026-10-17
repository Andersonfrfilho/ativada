// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  IGNORED_ALREADY_LONG_REASON,
  IGNORED_NO_POSITION_REASON,
  NO_READING_REASON,
} from './model-agents-messages.js';
import { TEAM_ACTION, type TeamReport } from './team-report.schema.js';

export const TEAM_SIGNAL_ACTION = { BUY: 'BUY', SELL: 'SELL', HOLD: 'HOLD' } as const;
export type TeamSignalAction = (typeof TEAM_SIGNAL_ACTION)[keyof typeof TEAM_SIGNAL_ACTION];

export const TEAM_SIGNAL_SOURCE = {
  REPORT: 'report',
  IGNORED: 'ignored',
  NO_READING: 'no_reading',
} as const;
export type TeamSignalSource = (typeof TEAM_SIGNAL_SOURCE)[keyof typeof TEAM_SIGNAL_SOURCE];

export const NO_READING_CODE = {
  MISSING: 'MISSING',
  PENDING: 'PENDING',
} as const;

// A linha gravada de `(equipe, par, t)` como o passo da execução a lê. `null` = não há linha.
export type TeamDecisionRecord =
  | { readonly status: 'decided'; readonly opinionId: string; readonly report: TeamReport }
  | { readonly status: 'pending' }
  | { readonly status: 'failed' | 'skipped'; readonly failureCode: string };

export type ToTeamSignalParams = {
  readonly record: TeamDecisionRecord | null;
  readonly hasPosition: boolean;
  // Abertura da vela de decisão `t`: a única vela que o sinal conhece (a ordem executa em `t + 1`, na carteira).
  readonly candleOpenTime: number;
};

export type TeamSignalLevels = {
  readonly entryPrice: string;
  readonly targetPrice: string;
  readonly stopPrice: string;
};

export type TeamSignal = {
  readonly candleOpenTime: number;
  readonly action: TeamSignalAction;
  // Texto decimal: +100 compra, −100 venda, 0 espera.
  readonly score: string;
  readonly reason: string;
  readonly source: TeamSignalSource;
  readonly opinionId: string | null;
  readonly failureCode: string | null;
  // Níveis sugeridos (opção A: exibidos e medidos, não comandam a ordem).
  readonly levels: TeamSignalLevels | null;
};

const SCORE = { BUY: '100', SELL: '-100', HOLD: '0' } as const;

function holdSignal(
  params: ToTeamSignalParams,
  extra: Pick<TeamSignal, 'reason' | 'source' | 'opinionId' | 'failureCode' | 'levels'>,
): TeamSignal {
  return {
    candleOpenTime: params.candleOpenTime,
    action: TEAM_SIGNAL_ACTION.HOLD,
    score: SCORE.HOLD,
    ...extra,
  };
}

function noReading(params: ToTeamSignalParams, failureCode: string): TeamSignal {
  return holdSignal(params, {
    reason: NO_READING_REASON,
    source: TEAM_SIGNAL_SOURCE.NO_READING,
    opinionId: null,
    failureCode,
    levels: null,
  });
}

function levelsOf(report: TeamReport): TeamSignalLevels | null {
  const { entryPrice, targetPrice, stopPrice } = report.decision;
  if (entryPrice === null || targetPrice === null || stopPrice === null) return null;
  return { entryPrice, targetPrice, stopPrice };
}

function fromReport(params: ToTeamSignalParams, opinionId: string, report: TeamReport): TeamSignal {
  const { action, reason } = report.decision;
  const base = { opinionId, failureCode: null, levels: levelsOf(report) };
  if (action === TEAM_ACTION.BUY && params.hasPosition) {
    return holdSignal(params, {
      ...base,
      reason: IGNORED_ALREADY_LONG_REASON,
      source: TEAM_SIGNAL_SOURCE.IGNORED,
    });
  }
  if (action === TEAM_ACTION.SELL && !params.hasPosition) {
    return holdSignal(params, {
      ...base,
      reason: IGNORED_NO_POSITION_REASON,
      source: TEAM_SIGNAL_SOURCE.IGNORED,
    });
  }
  const source = TEAM_SIGNAL_SOURCE.REPORT;
  if (action === TEAM_ACTION.BUY) {
    return {
      ...base,
      candleOpenTime: params.candleOpenTime,
      action: 'BUY',
      score: SCORE.BUY,
      reason,
      source,
    };
  }
  if (action === TEAM_ACTION.SELL) {
    return {
      ...base,
      candleOpenTime: params.candleOpenTime,
      action: 'SELL',
      score: SCORE.SELL,
      reason,
      source,
    };
  }
  return holdSignal(params, { ...base, reason, source });
}

// D9: a decisão GRAVADA de `t` vira o sinal de `t`. Pura e sem relógio: o mesmo registro e a mesma carteira dão o mesmo sinal,
// e nada depois de `t` entra. Compra sem posição → BUY; venda com posição → SELL; o resto espera (com o motivo da ignorada
// ou "equipe sem leitura"). Nunca há venda a descoberto.
export function toTeamSignal(params: ToTeamSignalParams): TeamSignal {
  const { record } = params;
  if (record === null) return noReading(params, NO_READING_CODE.MISSING);
  if (record.status === 'pending') return noReading(params, NO_READING_CODE.PENDING);
  if (record.status === 'decided') return fromReport(params, record.opinionId, record.report);
  return noReading(params, record.failureCode);
}
