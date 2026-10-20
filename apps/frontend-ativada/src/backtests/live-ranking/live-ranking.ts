// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatSignedPercentDown,
  parseScaled,
  roundRateDownToPercent,
} from '../../format/decimal.js';
import { formatSymbol } from '../../format/format.js';
import type { LiveSummaryItem } from '../../overview/live-summary.validation.js';
import { MODEL_TEAM_VISUAL } from '../../runs/model-teams/model-teams.constant.js';
import { RUN_STATUS } from '../../runs/run.constant.js';
import type { Run } from '../../runs/run.validation.js';

const ZERO = 0n;
const MINUS = '−';
const MEDAL_PLACES = 3;

export const RANKING_TONE = { UP: 'up', DOWN: 'down', FLAT: 'flat' } as const;
export type RankingTone = (typeof RANKING_TONE)[keyof typeof RANKING_TONE];

export const MEDAL = { GOLD: 'gold', SILVER: 'silver', BRONZE: 'bronze' } as const;
export type Medal = (typeof MEDAL)[keyof typeof MEDAL];
const MEDALS: readonly Medal[] = [MEDAL.GOLD, MEDAL.SILVER, MEDAL.BRONZE];
export const MEDAL_WORD: Readonly<Record<Medal, string>> = {
  gold: 'ouro',
  silver: 'prata',
  bronze: 'bronze',
};

export const TONE_WORD: Readonly<Record<RankingTone, string>> = {
  up: 'no lucro',
  down: 'no prejuízo',
  flat: 'empatada',
};

export type RankingEntry = {
  readonly runId: string;
  readonly position: number;
  readonly label: string;
  readonly rateText: string;
  readonly tone: RankingTone;
  readonly medal: Medal | undefined;
  readonly isCurrent: boolean;
};

type Scored = { readonly run: Run; readonly rate: bigint };

function toneOf(rate: bigint): RankingTone {
  const rounded = roundRateDownToPercent(rate);
  if (rounded === ZERO) return RANKING_TONE.FLAT;
  return rounded > ZERO ? RANKING_TONE.UP : RANKING_TONE.DOWN;
}

function rateTextOf(rate: bigint, tone: RankingTone): string {
  return tone === RANKING_TONE.FLAT ? '= 0,00%' : formatSignedPercentDown(rate).replace('-', MINUS);
}

function scoreRuns(runs: readonly Run[], summary: readonly LiveSummaryItem[]): Scored[] {
  const rates = new Map(summary.map((item) => [item.runId, parseScaled(item.resultRate)]));
  const scored: Scored[] = [];
  for (const run of runs) {
    const rate = rates.get(run.id);
    if (run.status === RUN_STATUS.RUNNING && rate !== undefined) scored.push({ run, rate });
  }
  return scored;
}

// Moeda, equipe e vela só quando duas execuções dividem a mesma moeda.
function labelOf(run: Run, scored: readonly Scored[]): string {
  const isShared = scored.filter((other) => other.run.symbol === run.symbol).length > 1;
  const team =
    run.signalSource === null || run.signalSource === undefined
      ? ''
      : ` ◆ ${MODEL_TEAM_VISUAL[run.signalSource.team].name}`;
  return `${formatSymbol(run.symbol)}${team}${isShared ? ` · ${run.timeframe}` : ''}`;
}

// Do maior resultado para o menor (os positivos naturalmente na frente); o empate mantém a ordem recebida.
export function buildRanking(
  runs: readonly Run[],
  summary: readonly LiveSummaryItem[],
  currentId: string,
): RankingEntry[] {
  const scored = scoreRuns(runs, summary);
  const sorted = [...scored].sort((a, b) => (a.rate === b.rate ? 0 : a.rate > b.rate ? -1 : 1));
  return sorted.map(({ run, rate }, index) => {
    const tone = toneOf(rate);
    const medalIndex = tone === RANKING_TONE.UP && index < MEDAL_PLACES ? index : undefined;
    return {
      runId: run.id,
      position: index + 1,
      label: labelOf(run, scored),
      rateText: rateTextOf(rate, tone),
      tone,
      medal: medalIndex === undefined ? undefined : MEDALS[medalIndex],
      isCurrent: run.id === currentId,
    };
  });
}
