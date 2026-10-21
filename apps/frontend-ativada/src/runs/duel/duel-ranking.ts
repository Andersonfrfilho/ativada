// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatScaled,
  formatSignedPercentDown,
  parseScaled,
  roundScaledDirected,
} from '../../format/decimal.js';
import {
  describeScoreboard,
  formatUsd,
  type ScoreboardText,
} from '../model-teams/team-sheet-text.js';
import type { Duel, DuelRankingRow } from './duel.validation.js';
import { DUEL_TEXT, runLabel } from './duel-text.js';

const PERCENT_FACTOR = 100n;
const NO_VALUE = '—';

export type RankingLine = {
  readonly runId: string;
  readonly position: number;
  readonly label: string;
  readonly team: DuelRankingRow['team'];
  readonly returnText: string;
  // Perda máxima (arredondada PARA CIMA: a queda nunca parece menor) e número de operações.
  readonly drawdownText: string;
  readonly trades: number;
  readonly accuracy: ScoreboardText | undefined;
  readonly cost: string;
};

function returnOrder(row: DuelRankingRow): bigint | undefined {
  return row.returnRate === null ? undefined : parseScaled(row.returnRate);
}

// Maior retorno primeiro (BigInt); quem ainda não tem retorno vai para o fim, na ordem original.
function sortRows(rows: readonly DuelRankingRow[]): readonly DuelRankingRow[] {
  return [...rows].sort((left, right) => {
    const a = returnOrder(left);
    const b = returnOrder(right);
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    if (a === b) return 0;
    return a < b ? 1 : -1;
  });
}

function drawdownText(rate: string | null): string {
  const scaled = rate === null ? undefined : parseScaled(rate);
  if (scaled === undefined) return NO_VALUE;
  const percent = roundScaledDirected(scaled * PERCENT_FACTOR, 2, 'up');
  return `${formatScaled(percent)}%`;
}

function costText(cost: DuelRankingRow['apiCost']): string {
  if (cost === null) return DUEL_TEXT.NO_API_COST;
  return `hoje ${formatUsd(cost.todayUsd)} · mês ${formatUsd(cost.monthUsd)}`;
}

function returnText(rate: string | null): string {
  const scaled = rate === null ? undefined : parseScaled(rate);
  return scaled === undefined ? NO_VALUE : formatSignedPercentDown(scaled);
}

// O ranking do duelo (RF21): retorno, perda máxima, operações, acerto de lado com Wilson e custo de API. Os números vêm do servidor
// (recalculados das curvas de patrimônio); aqui só se ordena e se escreve.
export function buildRanking(duel: Duel): readonly RankingLine[] {
  return sortRows(duel.ranking).map((row, index) => {
    const run = duel.runs.find((item) => item.runId === row.runId) ?? { team: row.team };
    return {
      runId: row.runId,
      position: index + 1,
      label: runLabel(run),
      team: row.team,
      returnText: returnText(row.returnRate),
      drawdownText: drawdownText(row.maxDrawdown),
      trades: row.trades,
      accuracy: row.scoreboard === null ? undefined : describeScoreboard(row.scoreboard),
      cost: costText(row.apiCost),
    };
  });
}
