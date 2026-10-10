// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  canonicalJson,
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
  // Séries longas: retoma só de 1 em `cutStride` pontos (mais os de borda do aquecimento).
  readonly cutStride?: number;
};

function isFiniteValue(value: IndicatorValue): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return Object.values(value).every((member) => Number.isFinite(member));
}

function assertWarmup<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
  series: readonly (TValue | undefined)[],
): void {
  const { warmupCandles, convergenceCandles } = params.definition.create(params.params);
  // Convergência é horizonte de pré-aquecimento: inteira e nunca menor que o aquecimento.
  if (!Number.isInteger(convergenceCandles) || convergenceCandles < warmupCandles) {
    throw new Error('Convergência menor que o aquecimento.');
  }
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

// Pontos de corte da retomada e do teste de repintura: o passo e as bordas do aquecimento.
function cutIndexesOf<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
): readonly number[] {
  const stride = params.cutStride ?? 1;
  const { warmupCandles } = params.definition.create(params.params);
  const last = params.candles.length - 2;
  const cuts = new Set<number>([0, last, warmupCandles - 2, warmupCandles - 1, warmupCandles]);
  for (let cut = 0; cut <= last; cut += stride) cuts.add(cut);
  return [...cuts].filter((cut) => cut >= 0 && cut <= last).sort((left, right) => left - right);
}

function runAll<TParams, TValue extends IndicatorValue>(
  params: Pick<IndicatorContractParams<TParams, TValue>, 'definition' | 'params'> & {
    readonly candles: readonly IndicatorCandle[];
  },
): (TValue | undefined)[] {
  const indicator = params.definition.create(params.params);
  return params.candles.map((candle) => indicator.update(candle));
}

// Retomar de um ponto pelo snapshot (que passa por JSON) dá os mesmos valores dali em diante, e o
// snapshot do restaurado é idêntico (JSON canônico) ao do original: nada se perde na ida e volta.
function assertRestoreEquivalence<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
  series: readonly (TValue | undefined)[],
): void {
  for (const cut of cutIndexesOf(params)) {
    const original = params.definition.create(params.params);
    params.candles.slice(0, cut + 1).forEach((candle) => original.update(candle));
    const snapshot = JSON.parse(JSON.stringify(original.snapshot())) as JsonValue;
    const restored = params.definition.restore({ params: params.params, snapshot });
    if (canonicalJson(restored.snapshot()) !== canonicalJson(original.snapshot())) {
      throw new Error(`Snapshot restaurado difere do original após o índice ${cut}.`);
    }
    const resumed = params.candles.slice(cut + 1).map((candle) => restored.update(candle));
    if (JSON.stringify(resumed) !== JSON.stringify(series.slice(cut + 1))) {
      throw new Error(`Retomada do snapshot após o índice ${cut} divergiu.`);
    }
  }
}

const REPAINT_FACTORS = [1.37, 0.63] as const;

function scaleCandle(candle: IndicatorCandle, factor: number): IndicatorCandle {
  return {
    openTime: candle.openTime,
    open: candle.open * factor,
    high: candle.high * factor,
    low: candle.low * factor,
    close: candle.close * factor,
    volume: candle.volume / factor,
  };
}

// Sem repintura: mexer em TODO o futuro depois do corte não muda nenhum valor até o corte.
function assertNoRepaint<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
  series: readonly (TValue | undefined)[],
): void {
  for (const cut of cutIndexesOf(params)) {
    for (const factor of REPAINT_FACTORS) {
      const perturbed = params.candles.map((candle, index) =>
        index <= cut ? candle : scaleCandle(candle, factor),
      );
      const values = runAll({
        definition: params.definition,
        params: params.params,
        candles: perturbed,
      });
      if (JSON.stringify(values.slice(0, cut + 1)) !== JSON.stringify(series.slice(0, cut + 1))) {
        throw new Error(`Valor até o índice ${cut} repintou com candles futuros ×${factor}.`);
      }
    }
  }
}

function hasNegativeZero(value: unknown): boolean {
  if (typeof value === 'number') return Object.is(value, -0);
  if (Array.isArray(value)) return value.some((member: unknown) => hasNegativeZero(member));
  if (typeof value === 'object' && value !== null)
    return Object.values(value).some(hasNegativeZero);
  return false;
}

function assertNoNegativeZero<TParams, TValue extends IndicatorValue>(
  params: IndicatorContractParams<TParams, TValue>,
  series: readonly (TValue | undefined)[],
): void {
  if (hasNegativeZero(series)) throw new Error('Valor com -0.');
  const indicator = params.definition.create(params.params);
  for (const candle of params.candles) {
    indicator.update(candle);
    if (hasNegativeZero(indicator.snapshot())) throw new Error('Snapshot com -0.');
  }
}

// Contrato que todo indicador da T2.2 precisa passar: aquecimento exato, lote = incremental, retomada,
// snapshot sem perda, sem repintura e sem -0.
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
  assertNoRepaint(params, series);
  assertNoNegativeZero(params, series);
}

export const SIMPLE_AVERAGE_DEFECT = {
  NONE: 'none',
  WRONG_WARMUP: 'wrong-warmup',
  LOSSY_SNAPSHOT: 'lossy-snapshot',
  SHORT_CONVERGENCE: 'short-convergence',
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
      // Janela finita: depois de `period` candles o primeiro já não pesa nada.
      convergenceCandles: defect === SIMPLE_AVERAGE_DEFECT.SHORT_CONVERGENCE ? period - 1 : period,
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
