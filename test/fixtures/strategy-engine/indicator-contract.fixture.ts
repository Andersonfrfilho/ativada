// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeIndicatorSeries,
  type IndicatorCandle,
  type IndicatorDefinition,
  type IndicatorValue,
  type JsonValue,
} from '../../../packages/strategy-engine/src/index.js';

export type IndicatorContractParams<TParams, TValue extends IndicatorValue> = {
  readonly definition: IndicatorDefinition<TParams, TValue>;
  readonly params: TParams;
  readonly candles: readonly IndicatorCandle[];
};

function isFiniteValue(value: IndicatorValue): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return Object.values(value).every((member) => Number.isFinite(member));
}

function assertWarmup<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
  series: readonly (TValue | undefined)[],
): void {
  const { warmupCandles } = params.definition.create(params.params);
  if (params.candles.length < warmupCandles + 2)
    throw new Error('Série curta demais para o contrato.');
  series.forEach((value, index) => {
    const isWarming = index < warmupCandles - 1;
    if (isWarming && value !== undefined)
      throw new Error(`Valor antes do aquecimento no índice ${index}.`);
    if (!isWarming && (value === undefined || !isFiniteValue(value))) {
      throw new Error(`Sem valor finito depois do aquecimento no índice ${index}.`);
    }
  });
}

// Retomar de qualquer ponto pelo snapshot (que passa por JSON) dá os mesmos valores dali em diante.
function assertRestoreEquivalence<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
  series: readonly (TValue | undefined)[],
): void {
  for (let cut = 0; cut < params.candles.length - 1; cut += 1) {
    const original = params.definition.create(params.params);
    params.candles.slice(0, cut + 1).forEach((candle) => original.update(candle));
    const snapshot = JSON.parse(JSON.stringify(original.snapshot())) as JsonValue;
    const restored = params.definition.restore({ params: params.params, snapshot });
    const resumed = params.candles.slice(cut + 1).map((candle) => restored.update(candle));
    if (JSON.stringify(resumed) !== JSON.stringify(series.slice(cut + 1))) {
      throw new Error(`Retomada do snapshot após o índice ${cut} divergiu.`);
    }
  }
}

// Contrato que todo indicador da T2.2 precisa passar: aquecimento exato, lote = incremental, retomada.
export function expectIndicatorContract<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
): void {
  const series = computeIndicatorSeries(params);
  const incremental = params.definition.create(params.params);
  const stepByStep = params.candles.map((candle) => incremental.update(candle));
  if (JSON.stringify(stepByStep) !== JSON.stringify(series))
    throw new Error('Lote divergiu do incremental.');
  if (JSON.stringify(computeIndicatorSeries(params)) !== JSON.stringify(series))
    throw new Error('Não determinístico.');
  assertWarmup(params, series);
  assertRestoreEquivalence(params, series);
}

export const SIMPLE_AVERAGE_DEFECT = {
  NONE: 'none',
  WRONG_WARMUP: 'wrong-warmup',
  LOSSY_SNAPSHOT: 'lossy-snapshot',
} as const;
export type SimpleAverageDefect =
  (typeof SIMPLE_AVERAGE_DEFECT)[keyof typeof SIMPLE_AVERAGE_DEFECT];

type SimpleAverageSnapshot = { readonly window: readonly number[] };

// Média simples do fechamento, só para provar o harness de indicador; os reais são da T2.2.
export function createSimpleAverageDefinition(
  defect: SimpleAverageDefect = SIMPLE_AVERAGE_DEFECT.NONE,
): IndicatorDefinition<{ readonly period: number }, number> {
  const build = (
    period: number,
    initialWindow: readonly number[],
  ): ReturnType<IndicatorDefinition<{ readonly period: number }, number>['create']> => {
    let window = [...initialWindow];
    return {
      warmupCandles: defect === SIMPLE_AVERAGE_DEFECT.WRONG_WARMUP ? period - 1 : period,
      update: (candle): number | undefined => {
        window = [...window.slice(-(period - 1)), candle.close];
        if (window.length < period) return undefined;
        return window.reduce((sum, value) => sum + value, 0) / period;
      },
      snapshot: (): JsonValue => ({
        window: defect === SIMPLE_AVERAGE_DEFECT.LOSSY_SNAPSHOT ? window.slice(1) : window,
      }),
    };
  };
  return {
    name: 'simple-average',
    create: ({ period }) => build(period, []),
    restore: ({ params, snapshot }) =>
      build(params.period, (snapshot as SimpleAverageSnapshot).window),
  };
}
