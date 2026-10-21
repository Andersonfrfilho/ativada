// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  divideFloor,
  formatScaled,
  parseScaled,
  roundScaledDirected,
  toPlainText,
} from '../format/decimal.js';
import type { LiveSummaryItem } from './live-summary.validation.js';
import { RUN_STATUS } from './overview.constant.js';
import type { Run } from './overview.validation.js';

export const SORT_KEY = { RECENT: 'recent', RESULT: 'result', SYMBOL: 'symbol' } as const;
export type SortKey = (typeof SORT_KEY)[keyof typeof SORT_KEY];

export const SIM_STATE = {
  RUNNING: 'running',
  QUEUED: 'queued',
  STALLED: 'stalled',
  WAITING: 'waiting',
} as const;
export type SimState = (typeof SIM_STATE)[keyof typeof SIM_STATE];

const MONEY_PLACES = 2;
const ZERO = 0n;

// Uma simulação ao vivo ativa da lista, com o resumo (saldo, resultado, operações) quando já chegou.
export type LiveSimulation = {
  readonly run: Run;
  readonly summary: LiveSummaryItem | undefined;
};

export type LiveTotal = {
  readonly count: number;
  readonly missing: number;
  readonly balanceText: string;
  // Texto decimal puro (para `describeLiveResult`, que arredonda o resultado para baixo).
  readonly result: string;
  readonly rate: string;
  readonly initialText: string | undefined;
};

// A lista chega da mais recente para a mais antiga (ordem da API): só as ativas, na mesma ordem.
export function joinSimulations(
  runs: readonly Run[],
  summaries: readonly LiveSummaryItem[],
): LiveSimulation[] {
  const byRun = new Map(summaries.map((item) => [item.runId, item]));
  return runs
    .filter((run) => run.status === RUN_STATUS.RUNNING || run.status === RUN_STATUS.QUEUED)
    .map((run) => ({ run, summary: byRun.get(run.id) }));
}

// A parada vem do servidor e vale sobre o resto, como no cartão-herói.
export function stateOf(simulation: LiveSimulation): SimState {
  const { run, summary } = simulation;
  if (run.status !== RUN_STATUS.RUNNING) return SIM_STATE.QUEUED;
  if (run.stalledSince !== undefined) return SIM_STATE.STALLED;
  return summary?.isWaitingForData === true ? SIM_STATE.WAITING : SIM_STATE.RUNNING;
}

export function rateOf(simulation: LiveSimulation): bigint | undefined {
  const text = simulation.summary?.resultRate;
  return text === undefined ? undefined : parseScaled(text);
}

export function operationsOf(simulation: LiveSimulation): number {
  const { summary } = simulation;
  return summary === undefined ? 0 : summary.buyCount + summary.sellCount;
}

export function symbolsOf(simulations: readonly LiveSimulation[]): string[] {
  return [...new Set(simulations.map((simulation) => simulation.run.symbol))].sort();
}

function byResultDescending(left: LiveSimulation, right: LiveSimulation): number {
  const leftRate = rateOf(left);
  const rightRate = rateOf(right);
  if (leftRate === undefined) return rightRate === undefined ? 0 : 1;
  if (rightRate === undefined) return -1;
  if (leftRate === rightRate) return 0;
  return leftRate > rightRate ? -1 : 1;
}

function bySymbol(left: LiveSimulation, right: LiveSimulation): number {
  return left.run.symbol.localeCompare(right.run.symbol);
}

// `sort` é estável: o empate mantém a ordem "mais recente primeiro" que a lista já tem.
export function arrangeSimulations(
  simulations: readonly LiveSimulation[],
  options: { readonly sort: SortKey; readonly symbol: string | undefined },
): LiveSimulation[] {
  const shown = simulations.filter(
    (simulation) => options.symbol === undefined || simulation.run.symbol === options.symbol,
  );
  if (options.sort === SORT_KEY.RESULT) return shown.sort(byResultDescending);
  if (options.sort === SORT_KEY.SYMBOL) return shown.sort(bySymbol);
  return shown;
}

// Escolha padrão do cartão-herói: a mais recente que já operou (a curva tem o que mostrar); sem nenhuma, a mais recente.
// O maior |resultado| foi descartado: ele troca de dono a cada vela e o destaque pularia sozinho.
export function pickDefaultFeatured(simulations: readonly LiveSimulation[]): Run | undefined {
  const traded = simulations.find((simulation) => operationsOf(simulation) > 0);
  return (traded ?? simulations[0])?.run;
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, ZERO);
}

function allEqual(values: readonly bigint[]): boolean {
  return values.every((value) => value === values[0]);
}

// Soma só de simulações ao vivo, em BigInt de 8 casas; o que aparece desce para o centavo (nunca parece melhor do que é).
export function totalOf(simulations: readonly LiveSimulation[]): LiveTotal {
  const measured = simulations.flatMap((simulation) => {
    const { summary } = simulation;
    if (summary === undefined) return [];
    const balance = parseScaled(summary.balance);
    const initial = parseScaled(summary.initialBalance);
    return balance === undefined || initial === undefined ? [] : [{ balance, initial }];
  });
  const balance = sum(measured.map((item) => item.balance));
  const initial = sum(measured.map((item) => item.initial));
  const rate = divideFloor(balance - initial, initial);
  const initials = measured.map((item) => item.initial);
  return {
    count: simulations.length,
    missing: simulations.length - measured.length,
    balanceText: formatScaled(roundScaledDirected(balance, MONEY_PLACES, 'down')),
    result: toPlainText(balance - initial),
    rate: toPlainText(rate ?? ZERO),
    initialText:
      measured.length > 0 && allEqual(initials) && initials[0] !== undefined
        ? formatScaled(initials[0], { minimumFraction: 0, maximumFraction: 2 })
        : undefined,
  };
}
