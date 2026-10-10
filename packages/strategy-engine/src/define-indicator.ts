// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertIndicatorCandle, finishIndicatorValue } from './indicator-input.js';
import type {
  Indicator,
  IndicatorCandle,
  IndicatorDefinition,
  IndicatorHorizon,
  IndicatorValue,
} from './indicator.types.js';
import type { JsonValue } from './json-value.types.js';

export type IndicatorStep<TState, TValue> = {
  readonly state: TState;
  readonly value: TValue | undefined;
};

export type AdvanceParams<TParams, TState> = {
  readonly params: TParams;
  readonly state: TState;
  readonly candle: IndicatorCandle;
};

// Um indicador é um estado JSON imutável e uma função `avançar(estado, candle) → (estado', valor)`:
// o snapshot é o próprio estado, a retomada é construir a partir dele, e um candle recusado não
// altera nada (o estado só troca depois que o passo termina).
export type StatefulIndicatorSpec<
  TParams,
  TState extends JsonValue,
  TValue extends IndicatorValue,
> = {
  readonly name: string;
  readonly horizon: (params: TParams) => IndicatorHorizon;
  readonly initialState: (params: TParams) => TState;
  readonly parseState: (params: {
    readonly params: TParams;
    readonly snapshot: JsonValue;
  }) => TState;
  readonly advance: (params: AdvanceParams<TParams, TState>) => IndicatorStep<TState, TValue>;
};

function buildIndicator<TParams, TState extends JsonValue, TValue extends IndicatorValue>(params: {
  readonly spec: StatefulIndicatorSpec<TParams, TState, TValue>;
  readonly indicatorParams: TParams;
  readonly initial: TState;
}): Indicator<TValue> {
  const { spec, indicatorParams } = params;
  const horizon = spec.horizon(indicatorParams);
  let state = params.initial;
  return {
    warmupCandles: horizon.warmupCandles,
    convergenceCandles: horizon.convergenceCandles,
    update: (candle): TValue | undefined => {
      assertIndicatorCandle(candle);
      const step = spec.advance({ params: indicatorParams, state, candle });
      const value = step.value === undefined ? undefined : finishIndicatorValue(step.value);
      state = step.state;
      return value;
    },
    snapshot: (): JsonValue => state,
  };
}

export function defineIndicator<TParams, TState extends JsonValue, TValue extends IndicatorValue>(
  spec: StatefulIndicatorSpec<TParams, TState, TValue>,
): IndicatorDefinition<TParams, TValue> {
  return {
    name: spec.name,
    create: (indicatorParams) =>
      buildIndicator({ spec, indicatorParams, initial: spec.initialState(indicatorParams) }),
    restore: ({ params: indicatorParams, snapshot }) =>
      buildIndicator({
        spec,
        indicatorParams,
        initial: spec.parseState({ params: indicatorParams, snapshot }),
      }),
  };
}
