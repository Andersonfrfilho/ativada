// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  arrangeSimulations,
  joinSimulations,
  pickDefaultFeatured,
  SORT_KEY,
  stateOf,
  totalOf,
  type LiveSimulation,
} from '../src/overview/live-simulations.js';
import type { LiveSummaryItem } from '../src/overview/live-summary.validation.js';
import type { Run } from '../src/overview/overview.validation.js';
import { pickProfitableBacktests } from '../src/overview/past-backtests.js';
import type { Run as BacktestRun } from '../src/runs/run.validation.js';

function run(id: string, symbol: string, overrides: Partial<Run> = {}): Run {
  return { id, status: 'running', symbol, timeframe: '1h', ...overrides };
}

function summary(runId: string, overrides: Partial<LiveSummaryItem> = {}): LiveSummaryItem {
  return {
    runId,
    strategyName: 'Placar clássico',
    analystMode: null,
    initialBalance: '10000',
    balance: '10000',
    result: '0',
    resultRate: '0',
    buyAndHold: null,
    buyCount: 0,
    sellCount: 0,
    lastDecisionAt: null,
    isWaitingForData: false,
    ...overrides,
  };
}

const RUNS: readonly Run[] = [
  run('link', 'LINKUSDT'),
  run('pepe', 'PEPEUSDT'),
  run('btc', 'BTCUSDT'),
  run('old', 'ETHUSDT', { status: 'completed' }),
  run('queued', 'SOLUSDT', { status: 'queued' }),
];

const SUMMARIES: readonly LiveSummaryItem[] = [
  summary('link'),
  summary('pepe', {
    balance: '10159.80',
    result: '159.80',
    resultRate: '0.0159800',
    buyCount: 3,
    sellCount: 2,
  }),
  summary('btc', { balance: '9900', result: '-100', resultRate: '-0.01' }),
];

function simulations(): LiveSimulation[] {
  return joinSimulations(RUNS, SUMMARIES);
}

function idsOf(list: readonly LiveSimulation[]): string[] {
  return list.map((simulation) => simulation.run.id);
}

describe('simulações ao vivo da Visão geral', () => {
  test('só as ativas entram, na ordem da API, cada uma com o próprio resumo', () => {
    const joined = simulations();
    expect(idsOf(joined)).toStrictEqual(['link', 'pepe', 'btc', 'queued']);
    expect(joined.at(-1)?.summary).toBeUndefined();
  });

  test('o estado: parada vale sobre rodando, espera por dado e fila têm o seu', () => {
    const [link, pepe] = joinSimulations(
      [run('link', 'LINKUSDT', { stalledSince: 1 }), run('pepe', 'PEPEUSDT')],
      [summary('link'), summary('pepe', { isWaitingForData: true })],
    );
    expect(link && stateOf(link)).toBe('stalled');
    expect(pepe && stateOf(pepe)).toBe('waiting');
    const queued = simulations().at(-1);
    expect(queued && stateOf(queued)).toBe('queued');
  });

  test('ordena por resultado (sem saldo no fim), por moeda e mantém a ordem recente por padrão', () => {
    const base = simulations();
    expect(idsOf(arrangeSimulations(base, { sort: SORT_KEY.RECENT, symbol: undefined }))).toEqual([
      'link',
      'pepe',
      'btc',
      'queued',
    ]);
    expect(idsOf(arrangeSimulations(base, { sort: SORT_KEY.RESULT, symbol: undefined }))).toEqual([
      'pepe',
      'link',
      'btc',
      'queued',
    ]);
    expect(idsOf(arrangeSimulations(base, { sort: SORT_KEY.SYMBOL, symbol: undefined }))).toEqual([
      'btc',
      'link',
      'pepe',
      'queued',
    ]);
  });

  test('filtra por moeda', () => {
    const shown = arrangeSimulations(simulations(), { sort: SORT_KEY.RECENT, symbol: 'PEPEUSDT' });
    expect(idsOf(shown)).toStrictEqual(['pepe']);
  });

  test('o destaque padrão é a mais recente que já operou; sem nenhuma, a mais recente', () => {
    expect(pickDefaultFeatured(simulations())?.id).toBe('pepe');
    const idle = joinSimulations(RUNS, [summary('link'), summary('btc')]);
    expect(pickDefaultFeatured(idle)?.id).toBe('link');
    expect(pickDefaultFeatured([])).toBeUndefined();
  });

  test('o total soma só o que tem saldo, em BigInt, e desce para o centavo', () => {
    const total = totalOf(simulations());
    expect(total.count).toBe(4);
    expect(total.missing).toBe(1);
    expect(total.balanceText).toBe('30.059,80');
    expect(total.result).toBe('59.80000000');
    expect(total.rate).toBe('0.00199333');
    expect(total.initialText).toBe('10.000');
  });

  test('saldo com sobra de centavo nunca arredonda a favor da estratégia', () => {
    const total = totalOf(
      joinSimulations([run('a', 'AUSDT')], [summary('a', { balance: '10000.019999' })]),
    );
    expect(total.balanceText).toBe('10.000,01');
  });
});

const MISSING = { value: null, reason: 'x' };
const METRICS_BASE = {
  initialBalance: '10000',
  finalEquity: '10000',
  benchmarkReturn: MISSING,
  excessReturn: MISSING,
  annualizedReturn: MISSING,
  sharpe: MISSING,
  sortino: MISSING,
  winRate: MISSING,
  profitFactor: MISSING,
  exposure: MISSING,
  maxDrawdownAtClose: { depth: '0.1', durationCandles: 3 },
  wins: 0,
  losses: 0,
  feesPaid: '1',
  netProfit: '0',
};

function backtest(
  id: string,
  rate: string | null,
  trades: number,
  status = 'completed',
): BacktestRun {
  const metrics =
    rate === null ? null : { ...METRICS_BASE, trades, totalReturn: { value: rate, reason: null } };
  return {
    id,
    strategyVersionId: 'sv',
    kind: 'backtest',
    status,
    symbol: 'PEPEUSDT',
    timeframe: '1h',
    runParameters: {},
    periodStart: 0,
    periodEnd: 1,
    progress: 100,
    metrics,
    overfitting: null,
    errorCode: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('backtests que lucraram', () => {
  test('só concluídos com retorno positivo, do maior para o menor', () => {
    const wins = pickProfitableBacktests([
      backtest('small', '0.0100', 40),
      backtest('loss', '-0.2', 10),
      backtest('zero', '0', 10),
      backtest('big', '0.1598', 3),
      backtest('running', '0.5', 3, 'running'),
      backtest('nometrics', null, 0),
    ]);
    expect(wins.map((win) => win.run.id)).toStrictEqual(['big', 'small']);
    expect(wins[0]?.trades).toBe(3);
  });
});
