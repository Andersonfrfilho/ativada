// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../format/decimal.js';
import { parseMetrics, type Run } from '../runs/run.validation.js';
import { RUN_STATUS } from './overview.constant.js';

export const PAST_WINS_SHOWN = 5;
// Abaixo disto o resultado diz quase nada: poucas operações podem ser sorte.
export const SMALL_SAMPLE_TRADES = 30;

const ZERO = 0n;

export type PastWin = {
  readonly run: Run;
  // Retorno total em fração escalada (8 casas).
  readonly rate: bigint;
  readonly trades: number | undefined;
};

function toWin(run: Run): PastWin | undefined {
  if (run.status !== RUN_STATUS.COMPLETED) return undefined;
  const metrics = parseMetrics(run.metrics);
  const value = metrics?.totalReturn.value;
  const rate = value === null || value === undefined ? undefined : parseScaled(value);
  return rate === undefined || rate <= ZERO ? undefined : { run, rate, trades: metrics?.trades };
}

// Só o que já está carregado (as últimas execuções): os que fecharam no lucro, do maior para o menor.
export function pickProfitableBacktests(runs: readonly Run[]): PastWin[] {
  return runs
    .flatMap((run) => toWin(run) ?? [])
    .sort((left, right) => (left.rate === right.rate ? 0 : left.rate > right.rate ? -1 : 1));
}

export function isSmallSample(win: PastWin): boolean {
  return win.trades === undefined || win.trades < SMALL_SAMPLE_TRADES;
}
