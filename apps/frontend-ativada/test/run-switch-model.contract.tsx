// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';
import type { ReactElement, ReactNode } from 'react';

import { renderHook, act } from '@testing-library/react';

import {
  mergeRecentRun,
  readRecentRuns,
  recordRecentRun,
  type RecentRun,
} from '../src/backtests/run-switch/recent-runs.js';
import { findNeighbours, nextActiveIndex } from '../src/backtests/run-switch/run-switch-order.js';
import {
  describeResult,
  matchesQuery,
  runTitle,
} from '../src/backtests/run-switch/run-switch-text.js';
import { RECENT_RUNS_LIMIT } from '../src/backtests/run-switch/run-switch.constant.js';
import { CarriedTimeframeProvider } from '../src/runs/candle-chart/CarriedTimeframe.context.js';
import {
  useTimeframeChoice,
  type TimeframeChoice,
} from '../src/runs/candle-chart/useTimeframeChoice.hook.js';
import { runSchema } from '../src/runs/run.validation.js';
import { buildMetrics, buildRun, metricValue } from './support/run-fixtures.js';

function visited(id: string): RecentRun {
  return { id, kind: 'backtest', symbol: 'BTCUSDT', timeframe: '1h', strategyVersionId: 'v-1' };
}

class FakeStorage {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const THROWING_STORAGE = {
  getItem: (): string | null => {
    throw new Error('blocked');
  },
  setItem: (): void => {
    throw new Error('blocked');
  },
};

describe('o resultado em cada linha: ícone, palavra e cor', () => {
  function look(overrides: Record<string, unknown>): ReturnType<typeof describeResult> {
    return describeResult(runSchema.parse(buildRun(overrides)));
  }

  test('a gain, a loss and a flat result carry arrow, sign and the number of trades', () => {
    const gain = look({ metrics: buildMetrics({ totalReturn: metricValue('0.0326'), trades: 7 }) });
    expect(gain).toEqual({ icon: 'arrowUp', tone: 'up', text: '+3,26% · 7 operações' });
    const loss = look({ metrics: buildMetrics({ totalReturn: metricValue('-0.011'), trades: 1 }) });
    expect(loss).toEqual({ icon: 'arrowDown', tone: 'down', text: '−1,10% · 1 operação' });
    const flat = look({ metrics: buildMetrics({ totalReturn: metricValue('0'), trades: 0 }) });
    expect(flat).toEqual({ icon: 'equal', tone: 'flat', text: '= 0,00% · sem operações' });
  });

  test('running shows the balance only when the list already carries it', () => {
    expect(look({ status: 'running', metrics: null }).text).toBe('Rodando');
    expect(look({ status: 'running' }).text).toBe('Rodando · saldo 10.420,00');
  });

  test('every other state has its own word and never relies on color alone', () => {
    expect(look({ status: 'queued', metrics: null }).text).toBe('Na fila');
    expect(look({ status: 'failed', metrics: null })).toEqual({
      icon: 'alert',
      tone: 'bad',
      text: 'Falhou',
    });
    expect(look({ status: 'cancelled', metrics: null }).text).toBe('Cancelada');
    expect(look({ status: 'estado-novo', metrics: null }).text).toBe('estado-novo');
  });

  test('titles name coin, candle and kind in plain words', () => {
    expect(runTitle({ symbol: 'BTCUSDT', timeframe: '4h', kind: 'walk_forward' })).toBe(
      'BTC/USDT · 4h · Walk-forward',
    );
    expect(runTitle({ symbol: 'BTCUSDT', timeframe: '1h', kind: 'live_paper' })).toBe(
      'BTC/USDT · 1h · Ao vivo',
    );
  });
});

describe('a busca', () => {
  const text = 'BTCUSDT BTC/USDT 1h Walk-forward Placar clássico · versão 2';

  test('every typed word must appear, in any order, ignoring case and accents', () => {
    expect(matchesQuery(text, 'btc')).toBe(true);
    expect(matchesQuery(text, 'classico placar')).toBe(true);
    expect(matchesQuery(text, 'walk forward')).toBe(true);
    expect(matchesQuery(text, 'btc/usdt 1H')).toBe(true);
    expect(matchesQuery(text, 'btc 4h')).toBe(false);
    expect(matchesQuery(text, '')).toBe(true);
  });
});

describe('anterior, próxima e as setas da lista', () => {
  test('neighbours follow the list order and say when the run is not in it', () => {
    expect(findNeighbours(['a', 'b', 'c'], 'b')).toEqual({
      isFound: true,
      previousId: 'a',
      nextId: 'c',
    });
    expect(findNeighbours(['a', 'b'], 'a').previousId).toBeUndefined();
    expect(findNeighbours(['a', 'b'], 'b').nextId).toBeUndefined();
    expect(findNeighbours(['a'], 'z').isFound).toBe(false);
  });

  test('arrows wrap around the ends and other keys leave the option alone', () => {
    expect(nextActiveIndex('ArrowDown', 2, 3)).toBe(0);
    expect(nextActiveIndex('ArrowUp', 0, 3)).toBe(2);
    expect(nextActiveIndex('a', 0, 3)).toBeUndefined();
    expect(nextActiveIndex('ArrowDown', 0, 0)).toBeUndefined();
  });
});

describe('os recentes (conveniência no navegador)', () => {
  test('keep only the last five, most recent first, without repeating', () => {
    let list: readonly RecentRun[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'c']) list = mergeRecentRun(list, visited(id));
    expect(list.map((item) => item.id)).toEqual(['c', 'f', 'e', 'd', 'b']);
    expect(list).toHaveLength(RECENT_RUNS_LIMIT);
  });

  test('round-trip through the storage, dropping broken items and keeping only labels', () => {
    const storage = new FakeStorage();
    const withExtraField = { ...visited('a'), startedAt: 'não vai' };
    recordRecentRun(withExtraField, storage);
    storage.setItem(
      'ativada.recent-runs',
      JSON.stringify([visited('a'), { id: 1 }, 'lixo', visited('b')]),
    );
    expect(readRecentRuns(storage).map((item) => item.id)).toEqual(['a', 'b']);
    expect(Object.keys(readRecentRuns(storage)[0] ?? {}).sort()).toEqual([
      'id',
      'kind',
      'strategyVersionId',
      'symbol',
      'timeframe',
    ]);
  });

  test('a storage that throws is the same as having none', () => {
    expect(readRecentRuns(THROWING_STORAGE)).toEqual([]);
    expect(() => recordRecentRun(visited('a'), THROWING_STORAGE)).not.toThrow();
  });
});

describe('a vela escolhida acompanha a troca de execução', () => {
  const OFFERED = ['1h', '4h', '1d'] as const;
  type ChoiceInput = { owner: string; offered: readonly TimeframeChoice[] };
  const FIRST_RUN: ChoiceInput = { owner: 'run-a', offered: OFFERED };

  function wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <CarriedTimeframeProvider>{children}</CarriedTimeframeProvider>;
  }

  test('the candle chosen on one run is shown on the next, when the environment offers it', () => {
    const { result, rerender } = renderHook(
      (owner: string) => useTimeframeChoice({ owner, runTimeframe: '1h', offered: OFFERED }),
      { wrapper, initialProps: 'run-a' },
    );
    expect(result.current.timeframe).toBe('1h');
    act(() => result.current.choose('4h'));
    expect(result.current.timeframe).toBe('4h');
    rerender('run-b');
    expect(result.current.timeframe).toBe('4h');
  });

  test('a candle the next run cannot offer falls back to its own, and going back clears it', () => {
    const { result, rerender } = renderHook(
      (input: ChoiceInput) => useTimeframeChoice({ ...input, runTimeframe: '1h' }),
      { wrapper, initialProps: FIRST_RUN },
    );
    act(() => result.current.choose('4h'));
    rerender({ owner: 'run-b', offered: ['1h', '1d'] });
    expect(result.current.timeframe).toBe('1h');
    rerender({ owner: 'run-c', offered: OFFERED });
    expect(result.current.timeframe).toBe('4h');
    act(() => result.current.clear());
    expect(result.current.timeframe).toBe('1h');
  });

  test('without the provider (any other screen) nothing is carried over', () => {
    const { result, rerender } = renderHook(
      (owner: string) => useTimeframeChoice({ owner, runTimeframe: '1h', offered: OFFERED }),
      { initialProps: 'run-a' },
    );
    act(() => result.current.choose('4h'));
    rerender('run-b');
    expect(result.current.timeframe).toBe('1h');
  });
});
