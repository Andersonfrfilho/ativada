// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorValue } from '../../../../packages/strategy-engine/src/index.js';
import {
  OracleDecimal,
  type OracleSeries,
  type OracleValue,
  SINGLE_OUTPUT,
} from './oracle-decimal.fixture.js';

// 1e-8 relativo: padrão declarado no ADR 0002 para todo indicador.
export const DEFAULT_TOLERANCE = 1e-8;

export type OutputFloor = (params: { readonly output: string; readonly index: number }) => number;
export type ReferenceSeries = readonly (Readonly<Record<string, number>> | undefined)[];

export type SeriesComparison = {
  readonly maxError: number;
  readonly worstIndex: number;
  readonly worstOutput: string;
  readonly comparedCount: number;
};

export type CompareSeriesParams<TReference> = {
  readonly actual: readonly (IndicatorValue | undefined)[];
  readonly expected: readonly (TReference | undefined)[];
  readonly floorOf?: OutputFloor;
  readonly fromIndex?: number;
};

const NO_FLOOR: OutputFloor = () => 0;

export function toOutputs(value: IndicatorValue): Readonly<Record<string, number>> {
  return typeof value === 'number' ? { [SINGLE_OUTPUT]: value } : value;
}

// |obtido − referência| / máx(|referência|, piso), com 0/0 = 0.
export function relativeErrorAgainstOracle(params: {
  readonly actual: number;
  readonly expected: OracleValue[string];
  readonly floor: number;
}): number {
  const difference = new OracleDecimal(params.actual).minus(params.expected).abs();
  if (difference.isZero()) return 0;
  const denominator = OracleDecimal.max(params.expected.abs(), params.floor);
  return difference.dividedBy(denominator).toNumber();
}

export function relativeErrorAgainstNumber(params: {
  readonly actual: number;
  readonly expected: number;
  readonly floor: number;
}): number {
  const difference = Math.abs(params.actual - params.expected);
  if (difference === 0) return 0;
  return difference / Math.max(Math.abs(params.expected), params.floor);
}

function assertSameShape(params: {
  readonly index: number;
  readonly actual: Readonly<Record<string, number>>;
  readonly expectedKeys: readonly string[];
}): void {
  const actualKeys = Object.keys(params.actual).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...params.expectedKeys].sort())) {
    throw new Error(`Saídas divergem no índice ${params.index}: ${actualKeys.join(',')}.`);
  }
}

type ErrorOfParams<TReference> = {
  readonly actual: number;
  readonly expected: TReference;
  readonly floor: number;
};

function compareSeries<TReference>(
  params: CompareSeriesParams<Readonly<Record<string, TReference>>> & {
    readonly errorOf: (params: ErrorOfParams<TReference>) => number;
  },
): SeriesComparison {
  const floorOf = params.floorOf ?? NO_FLOOR;
  let result: SeriesComparison = { maxError: 0, worstIndex: -1, worstOutput: '', comparedCount: 0 };
  params.expected.forEach((expected, index) => {
    if (index < (params.fromIndex ?? 0)) return;
    const actualValue = params.actual[index];
    // Aquecimento: o oráculo e o indicador precisam começar a devolver valor no mesmo candle.
    if ((expected === undefined) !== (actualValue === undefined)) {
      throw new Error(`Aquecimento diverge do oráculo no índice ${index}.`);
    }
    if (expected === undefined || actualValue === undefined) return;
    const outputs = toOutputs(actualValue);
    assertSameShape({ index, actual: outputs, expectedKeys: Object.keys(expected) });
    for (const [output, value] of Object.entries(outputs)) {
      const reference = expected[output];
      if (reference === undefined) continue;
      const error = params.errorOf({
        actual: value,
        expected: reference,
        floor: floorOf({ output, index }),
      });
      result = {
        maxError: Math.max(result.maxError, error),
        worstIndex: error > result.maxError ? index : result.worstIndex,
        worstOutput: error > result.maxError ? output : result.worstOutput,
        comparedCount: result.comparedCount + 1,
      };
    }
  });
  return result;
}

export function compareWithOracle(params: CompareSeriesParams<OracleValue>): SeriesComparison {
  return compareSeries({
    ...params,
    errorOf: ({ actual, expected, floor }) =>
      relativeErrorAgainstOracle({ actual, expected, floor }),
  });
}

export function compareWithReference(
  params: CompareSeriesParams<Readonly<Record<string, number>>>,
): SeriesComparison {
  return compareSeries({
    ...params,
    errorOf: ({ actual, expected, floor }) =>
      relativeErrorAgainstNumber({ actual, expected, floor }),
  });
}

export function oracleSeriesToNumbers(series: OracleSeries): ReferenceSeries {
  return series.map((value) =>
    value === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(value).map(([output, entry]) => [output, entry.toNumber()]),
        ),
  );
}
