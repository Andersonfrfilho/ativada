// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorValue } from './indicator.types.js';
import { INDICATOR_ERROR_CODE, IndicatorError } from './strategy-engine.error.js';

export type ReadIndicatorOutputParams = {
  readonly value: IndicatorValue | undefined;
  readonly output: string;
  readonly indicatorId: string;
};

export function missingIndicatorValue(indicatorId: string, detail: string): never {
  throw new IndicatorError({
    code: INDICATOR_ERROR_CODE.MISSING_VALUE,
    message: `Indicador "${indicatorId}" sem valor depois do aquecimento (${detail}).`,
  });
}

// Saída nomeada de um indicador de várias saídas; ausente ou de outro formato é erro, nunca voto.
export function readIndicatorOutput(params: ReadIndicatorOutputParams): number {
  const { value, output, indicatorId } = params;
  if (value === undefined || typeof value === 'number') {
    return missingIndicatorValue(indicatorId, `saída ${output}`);
  }
  const member = value[output];
  if (member === undefined) return missingIndicatorValue(indicatorId, `saída ${output}`);
  return member;
}

export function readIndicatorScalar(params: {
  readonly value: IndicatorValue | undefined;
  readonly indicatorId: string;
}): number {
  if (typeof params.value !== 'number') {
    return missingIndicatorValue(params.indicatorId, 'valor');
  }
  return params.value;
}
