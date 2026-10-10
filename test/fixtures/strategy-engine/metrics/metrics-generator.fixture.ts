// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type ComputeRunMetricsParams,
  type EquityPointDecision,
  type ExitReason,
  type MetricsClosedPosition,
} from '../../../../packages/strategy-engine/src/index.js';
import { createRandom } from '../risk/risk-grid.fixture.js';
import { METRICS_BASE_TIME, MILLISECONDS_PER_DAY } from './metrics-series.fixture.js';

const EXIT_REASONS: readonly ExitReason[] = ['stop', 'target', 'signal', 'command', 'gap'];
const TIMEFRAMES: readonly number[] = [900_000, 3_600_000, 14_400_000, MILLISECONDS_PER_DAY];
const BASIS_POINTS = 10_000;
const CENTS_CEILING = 1_000_000_000_000;
const INITIAL_CENTS = 1_000_000;
const MAX_SERIES_POINTS = 70;

// Centavos inteiros viram texto decimal exato ("12345" → "123.45"): nenhum ponto flutuante na série.
export function centsText(cents: number): string {
  return new EngineDecimal(`${cents}e-2`).toFixed();
}

type Random = (limit: number) => number;

// Passo multiplicativo em pontos-base, em inteiros: o produto fica abaixo de 2^53 com o teto de centavos.
function stepCents(previous: number, random: Random): number {
  const basisPoints = BASIS_POINTS - 900 + random(2_000);
  return Math.min(CENTS_CEILING, Math.max(1, Math.floor((previous * basisPoints) / BASIS_POINTS)));
}

function buildPoints(random: Random, timeframe: number): EquityPointDecision[] {
  const count = 1 + random(MAX_SERIES_POINTS);
  let equity = INITIAL_CENTS;
  let benchmark = INITIAL_CENTS;
  let time = METRICS_BASE_TIME;
  return Array.from({ length: count }, (_unused, index) => {
    // De vez em quando falta alguns candles entre dois pontos (lacuna confirmada).
    time += index === 0 ? 0 : timeframe * (1 + (random(20) === 0 ? random(5) : 0));
    equity = index === 0 ? INITIAL_CENTS : stepCents(equity, random);
    benchmark = index === 0 ? INITIAL_CENTS : stepCents(benchmark, random);
    const low = Math.max(1, equity - Math.floor((equity * random(600)) / BASIS_POINTS));
    return {
      candleOpenTime: time,
      equity: centsText(equity),
      equityAtLow: centsText(low),
      benchmark: centsText(benchmark),
    };
  });
}

type TradeSlot = { readonly opened: number; readonly closed: number };

// Operações disjuntas sobre os índices dos pontos: cada uma abre depois que a anterior saiu.
function buildSlots(
  random: Random,
  pointCount: number,
): { slots: TradeSlot[]; openFrom: number | null } {
  const slots: TradeSlot[] = [];
  let cursor = 0;
  while (cursor < pointCount - 1 && random(3) !== 0) {
    const opened = cursor + random(3);
    const closed = opened + random(5);
    if (closed >= pointCount) break;
    slots.push({ opened, closed });
    cursor = closed + 1 + random(2);
  }
  const hasOpen = cursor < pointCount && random(2) === 0;
  return { slots, openFrom: hasOpen ? cursor + random(pointCount - cursor) : null };
}

function timeAt(points: readonly EquityPointDecision[], index: number): number {
  return points[Math.min(index, points.length - 1)]?.candleOpenTime ?? METRICS_BASE_TIME;
}

function buildTrade(params: {
  readonly points: readonly EquityPointDecision[];
  readonly slot: TradeSlot;
  readonly random: Random;
}): MetricsClosedPosition {
  const { points, slot, random } = params;
  return {
    openedCandleOpenTime: timeAt(points, slot.opened),
    candleOpenTime: timeAt(points, slot.closed),
    entryFee: centsText(random(5_000)),
    exitFee: centsText(random(5_000)),
    netProfit: centsText(random(400_000) - 200_000),
    exitReason: EXIT_REASONS[random(EXIT_REASONS.length)] ?? 'signal',
  };
}

// Série reproduzível pela semente: PRNG inteiro, sem relógio. `random(1)` do laço mantém a ordem estável.
export function buildMetricsCase(seed: number): ComputeRunMetricsParams {
  const random = createRandom(seed);
  const timeframeMilliseconds = TIMEFRAMES[random(TIMEFRAMES.length)] ?? MILLISECONDS_PER_DAY;
  const equityPoints = buildPoints(random, timeframeMilliseconds);
  const { slots, openFrom } = buildSlots(random, equityPoints.length);
  return {
    equityPoints,
    closedPositions: slots.map((slot) => buildTrade({ points: equityPoints, slot, random })),
    openPosition:
      openFrom === null
        ? null
        : {
            openedCandleOpenTime: timeAt(equityPoints, openFrom),
            entryFee: centsText(random(5_000)),
            unrealizedProfit: centsText(random(200_000) - 100_000),
          },
    run: { initialBalance: centsText(INITIAL_CENTS), timeframeMilliseconds },
  };
}

// Multiplica todo dinheiro por um inteiro: razões e quedas não podem mudar.
export function scaleMetricsCase(
  base: ComputeRunMetricsParams,
  factor: number,
): ComputeRunMetricsParams {
  const scale = (text: string): string => new EngineDecimal(text).times(factor).toFixed();
  return {
    run: { ...base.run, initialBalance: scale(base.run.initialBalance) },
    equityPoints: base.equityPoints.map((point) => ({
      ...point,
      equity: scale(point.equity),
      equityAtLow: scale(point.equityAtLow),
      benchmark: scale(point.benchmark),
    })),
    closedPositions: base.closedPositions.map((trade) => ({
      ...trade,
      entryFee: scale(trade.entryFee),
      exitFee: scale(trade.exitFee),
      netProfit: scale(trade.netProfit),
    })),
    openPosition:
      base.openPosition === null
        ? null
        : {
            ...base.openPosition,
            entryFee: scale(base.openPosition.entryFee),
            unrealizedProfit: scale(base.openPosition.unrealizedProfit),
          },
  };
}

// Acrescenta um ponto no fim, depois do último, com patrimônio e mínima novos.
export function appendPoint(base: ComputeRunMetricsParams, seed: number): ComputeRunMetricsParams {
  const random = createRandom(seed);
  const last = base.equityPoints.at(-1);
  const lastEquity = Number(new EngineDecimal(last?.equity ?? '1').times(100).toFixed(0));
  const equity = stepCents(lastEquity, random);
  const low = Math.max(1, equity - Math.floor((equity * random(900)) / BASIS_POINTS));
  const point: EquityPointDecision = {
    candleOpenTime: (last?.candleOpenTime ?? METRICS_BASE_TIME) + base.run.timeframeMilliseconds,
    equity: centsText(equity),
    equityAtLow: centsText(low),
    benchmark: last?.benchmark ?? centsText(INITIAL_CENTS),
  };
  return { ...base, equityPoints: [...base.equityPoints, point] };
}
