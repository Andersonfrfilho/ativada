// Copyright (c) 2026 Ada Technology. All rights reserved.
import { Decimal } from '../../../../packages/strategy-engine/test-support/oracle-dependencies.js';

// Verdade numérica dos indicadores: 40 dígitos, só `+ − × ÷ sqrt` (sem exp/log), como o ADR 0002.
export const OracleDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type OracleNumber = Decimal;
export type OracleValue = Readonly<Record<string, OracleNumber>>;
export type OracleSeries = readonly (OracleValue | undefined)[];

export type OracleCandle = {
  readonly openTime: number;
  readonly open: OracleNumber;
  readonly high: OracleNumber;
  readonly low: OracleNumber;
  readonly close: OracleNumber;
  readonly volume: OracleNumber;
};

export const SINGLE_OUTPUT = 'value';
export const ZERO = new OracleDecimal(0);
const ONE = new OracleDecimal(1);
const TWO = new OracleDecimal(2);

export function toOracleNumber(text: string | number): OracleNumber {
  return new OracleDecimal(text);
}

export function single(value: OracleNumber): OracleValue {
  return { [SINGLE_OUTPUT]: value };
}

export function sumOf(values: readonly OracleNumber[]): OracleNumber {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

export function averageOf(values: readonly OracleNumber[]): OracleNumber {
  return sumOf(values).dividedBy(values.length);
}

// Desvio POPULACIONAL (divisor n): o mesmo do TA-Lib e da `trading-signals`.
export function populationDeviationOf(values: readonly OracleNumber[]): OracleNumber {
  const mean = averageOf(values);
  const squares = values.map((value) => value.minus(mean).pow(2));
  return sumOf(squares).dividedBy(values.length).sqrt();
}

export function windowAt<TItem>(items: readonly TItem[], end: number, size: number): TItem[] {
  return items.slice(end - size + 1, end + 1);
}

export const SMOOTHING_KIND = { EXPONENTIAL: 'exponential', WILDER: 'wilder' } as const;
export type SmoothingKind = (typeof SMOOTHING_KIND)[keyof typeof SMOOTHING_KIND];

export type SmoothSeriesParams = {
  readonly inputs: readonly (OracleNumber | undefined)[];
  readonly period: number;
  readonly kind: SmoothingKind;
};

// Forma de livro, diferente da do código incremental: EMA `α·x + (1−α)·ant`; Wilder `(ant·(n−1) + x)/n`.
function nextSmoothed(
  previous: OracleNumber,
  input: OracleNumber,
  params: SmoothSeriesParams,
): OracleNumber {
  if (params.kind === SMOOTHING_KIND.WILDER) {
    return previous
      .times(params.period - 1)
      .plus(input)
      .dividedBy(params.period);
  }
  const alpha = TWO.dividedBy(params.period + 1);
  return alpha.times(input).plus(ONE.minus(alpha).times(previous));
}

// Semente = média simples das `period` primeiras entradas definidas; entradas definidas são contíguas.
export function smoothSeries(params: SmoothSeriesParams): (OracleNumber | undefined)[] {
  const first = params.inputs.findIndex((input) => input !== undefined);
  const output: (OracleNumber | undefined)[] = params.inputs.map(() => undefined);
  if (first < 0) return output;
  const seedIndex = first + params.period - 1;
  let previous: OracleNumber | undefined;
  for (let index = seedIndex; index < params.inputs.length; index += 1) {
    const input = params.inputs[index];
    if (input === undefined) throw new Error(`Entrada ausente no índice ${index}.`);
    previous =
      previous === undefined
        ? averageOf(windowAt(params.inputs, index, params.period) as OracleNumber[])
        : nextSmoothed(previous, input, params);
    output[index] = previous;
  }
  return output;
}
