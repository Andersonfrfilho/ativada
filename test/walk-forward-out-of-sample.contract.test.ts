// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  ChainCarry,
  ChainedWindowResult,
  EquityPointDecision,
  WindowTestResult,
} from '../packages/strategy-engine/src/index.js';
import {
  createRandom,
  loadWalkForwardEngineApi,
  pickInteger,
} from './fixtures/walk-forward/walk-forward-api.fixture.js';

const { chainWindowResult, computeRunMetrics, concatenateOutOfSample, EngineDecimal } =
  await loadWalkForwardEngineApi();

// 3 155 760 ms = 10 000 períodos por ano: a raiz do fator de anualização é exatamente 100.
const RUN = { initialBalance: '1000', timeframeMilliseconds: 3_155_760 } as const;
const STEP = RUN.timeframeMilliseconds;
const PROPERTY_CASES = 1_000;

function point(index: number, equity: string, low: string, benchmark: string): EquityPointDecision {
  return { candleOpenTime: index * STEP, equity, equityAtLow: low, benchmark };
}

function result(
  index: number,
  points: readonly EquityPointDecision[],
  extra: Partial<WindowTestResult> = {},
): WindowTestResult {
  return {
    index,
    equityPoints: points,
    closedPositions: [],
    openPosition: null,
    ...extra,
  };
}

function chainAll(results: readonly WindowTestResult[]): ChainedWindowResult[] {
  const chained: ChainedWindowResult[] = [];
  let carried: ChainCarry = { equity: RUN.initialBalance, benchmark: RUN.initialBalance };
  for (const window of results) {
    const next = chainWindowResult({ result: window, carried, run: RUN });
    chained.push(next);
    carried = { equity: next.endEquity, benchmark: next.endBenchmark };
  }
  return chained;
}

describe('encadeamento do patrimônio entre janelas de teste', () => {
  const first = result(0, [point(1, '1100', '1090', '1050'), point(2, '1210', '1200', '1100')]);
  const second = result(1, [point(4, '900', '880', '1020'), point(5, '990', '985', '1122')]);

  test('cada janela recomeça do patrimônio final da anterior, em unidades relativas', () => {
    const [one, two] = chainAll([first, second]);
    expect(one?.scale).toBe('1');
    expect(one?.equityPoints.map((item) => item.equity)).toEqual(['1100', '1210']);
    expect(one?.endEquity).toBe('1210');
    // fator = 1210 ÷ 1000 = 1,21
    expect(two?.scale).toBe('1.21');
    expect(two?.equityPoints.map((item) => item.equity)).toEqual(['1089', '1197.9']);
    expect(two?.equityPoints.map((item) => item.equityAtLow)).toEqual(['1064.8', '1191.85']);
    expect(two?.endEquity).toBe('1197.9');
  });

  test('a régua continua do valor final dela, sem repagar a entrada: cresce pela razão interna', () => {
    const [, two] = chainAll([first, second]);
    // régua da janela 2 em relação ao primeiro ponto dela: 1020 → 1020, 1122 → ×1,1; sobre 1100 vira 1100 e 1210.
    expect(two?.equityPoints.map((item) => item.benchmark)).toEqual(['1100', '1210']);
    expect(two?.endBenchmark).toBe('1210');
  });

  test('o Sharpe fora da amostra bate com a conta à mão: (10/3) × √75 = 28,867513459481', () => {
    const chained = chainAll([first, second]);
    const outcome = concatenateOutOfSample({ windows: chained, run: RUN });
    // retornos: 1210÷1100−1 = 0,1 ; 1089÷1210−1 = −0,1 ; 1197,9÷1089−1 = 0,1
    const expected = new EngineDecimal(75).sqrt().times(10).dividedBy(3).toDecimalPlaces(12);
    expect(outcome.metrics.sharpe).toEqual({ value: expected.toFixed(), reason: null });
    expect(outcome.metrics.totalReturn).toEqual({ value: '0.1979', reason: null });
    expect(outcome.equityPoints).toHaveLength(4);
  });

  test('as métricas são as de computeRunMetrics sobre a curva concatenada', () => {
    const chained = chainAll([first, second]);
    const outcome = concatenateOutOfSample({ windows: chained, run: RUN });
    expect(outcome.metrics).toEqual(
      computeRunMetrics({
        equityPoints: outcome.equityPoints,
        closedPositions: outcome.closedPositions,
        openPosition: null,
        run: RUN,
      }),
    );
  });
});

describe('janela sem parâmetros elegíveis', () => {
  test('carteira parada: o patrimônio fica no valor carregado e não há operações', () => {
    const parked = result(1, [point(4, '1000', '1000', '1010'), point(5, '1000', '1000', '1030')]);
    const [one, two] = chainAll([
      result(0, [point(1, '1100', '1100', '1050'), point(2, '1100', '1100', '1100')]),
      parked,
    ]);
    expect(one?.endEquity).toBe('1100');
    expect(two?.equityPoints.map((item) => item.equity)).toEqual(['1100', '1100']);
    expect(two?.trades).toEqual([]);
  });
});

describe('posição ainda aberta no fim da janela de teste', () => {
  test('vira operação encerrada pela liquidação, no último candle, para a contabilidade fechar', () => {
    const open = result(0, [point(1, '1050', '1040', '1000'), point(2, '1080', '1070', '1010')], {
      openPosition: { openedCandleOpenTime: 1 * STEP, entryFee: '1', unrealizedProfit: '75' },
    });
    const [chained] = chainAll([open]);
    expect(chained?.trades).toEqual([
      {
        openedCandleOpenTime: 1 * STEP,
        candleOpenTime: 2 * STEP,
        entryFee: '1',
        exitFee: '0',
        netProfit: '75',
        exitReason: 'command',
      },
    ]);
    expect(chained?.liquidatedAtWindowEnd).toBe(true);
  });

  test('operações fechadas saem na escala do encadeamento', () => {
    const closed = result(1, [point(4, '1000', '1000', '1000'), point(5, '1100', '1100', '1100')], {
      closedPositions: [
        {
          openedCandleOpenTime: 4 * STEP,
          candleOpenTime: 5 * STEP,
          entryFee: '1',
          exitFee: '2',
          netProfit: '100',
          exitReason: 'target',
        },
      ],
    });
    const chained = chainAll([
      result(0, [point(1, '2000', '2000', '1000'), point(2, '2000', '2000', '1000')]),
      closed,
    ]);
    expect(chained[1]?.scale).toBe('2');
    expect(chained[1]?.trades).toEqual([
      {
        openedCandleOpenTime: 4 * STEP,
        candleOpenTime: 5 * STEP,
        entryFee: '2',
        exitFee: '4',
        netProfit: '200',
        exitReason: 'target',
      },
    ]);
  });
});

describe('propriedades sobre janelas aleatórias', () => {
  test(`${PROPERTY_CASES} encadeamentos: contínuo, determinístico e sem mutar a entrada`, () => {
    const random = createRandom(20_261_016);
    for (let round = 0; round < PROPERTY_CASES; round += 1) {
      const windows: WindowTestResult[] = [];
      let time = 1;
      for (let index = 0; index < pickInteger(random, 2, 6); index += 1) {
        let equityCents = 100_000;
        const points: EquityPointDecision[] = [];
        for (let candle = 0; candle < pickInteger(random, 2, 8); candle += 1) {
          equityCents = Math.max(10_000, equityCents + pickInteger(random, -3_000, 3_200));
          const equity = (equityCents / 100).toFixed(2);
          points.push(point(time, equity, (equityCents / 100 - 1).toFixed(2), equity));
          time += 1;
        }
        windows.push(result(index, points));
        time += pickInteger(random, 0, 3);
      }
      const frozen = structuredClone(windows);
      const chained = chainAll(windows);
      expect(windows).toEqual(frozen);
      expect(chainAll(windows)).toEqual(chained);
      chained.forEach((item, position) => {
        const previous = chained[position - 1];
        const firstPoint = item.equityPoints[0];
        const rawFirst = windows[position]?.equityPoints[0];
        if (previous === undefined || firstPoint === undefined || rawFirst === undefined) return;
        const jump = new EngineDecimal(firstPoint.equity).dividedBy(previous.endEquity);
        const raw = new EngineDecimal(rawFirst.equity).dividedBy(RUN.initialBalance);
        expect(jump.minus(raw).abs().lessThan('1e-9')).toBe(true);
        item.equityPoints.forEach((chainedPoint) => {
          expect(new EngineDecimal(chainedPoint.equityAtLow).lte(chainedPoint.equity)).toBe(true);
        });
      });
      expect(() => concatenateOutOfSample({ windows: chained, run: RUN })).not.toThrow();
    }
  });
});
