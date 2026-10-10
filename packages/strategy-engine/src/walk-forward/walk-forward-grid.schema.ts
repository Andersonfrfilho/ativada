// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

import { parseTunablePath } from './tunable-parameter.catalog.js';
import {
  MAX_GRID_PARAMETERS,
  MAX_VALUES_PER_PARAMETER,
  WALK_FORWARD_ERROR_CODE,
} from './walk-forward.constant.js';
import { WalkForwardError } from './walk-forward.error.js';
import type { WalkForwardGrid } from './walk-forward.types.js';

const DECIMAL_VALUE_PATTERN = /^-?\d{1,18}(\.\d{1,12})?$/;

const GRID_VALUE_SCHEMA = z.union([
  z.number().int(),
  z.string().regex(DECIMAL_VALUE_PATTERN, 'Valor decimal em texto, como "1.5".'),
]);

const PARAMETER_SCHEMA = z.strictObject({
  path: z
    .string()
    .refine((path) => parseTunablePath(path) !== undefined, 'Caminho fora do catálogo ajustável.'),
  values: z
    .array(GRID_VALUE_SCHEMA)
    .min(1)
    .max(MAX_VALUES_PER_PARAMETER)
    .refine((values) => new Set(values).size === values.length, 'Valores repetidos.')
    .refine(
      (values) => values.every((value) => typeof value === typeof values[0]),
      'Os valores de um parâmetro têm todos o mesmo tipo.',
    ),
});

// A grade mora na EXECUÇÃO, não na versão da estratégia (ADR 0002): é entrada do walk-forward.
export const WALK_FORWARD_GRID_SCHEMA = z.strictObject({
  parameters: z
    .array(PARAMETER_SCHEMA)
    .min(1)
    .max(MAX_GRID_PARAMETERS)
    .refine(
      (parameters) => new Set(parameters.map((item) => item.path)).size === parameters.length,
      'Caminho repetido na grade.',
    ),
});

// A mensagem é a do nosso esquema: o valor que o usuário digitou nunca volta no erro.
export function parseWalkForwardGrid(input: unknown): WalkForwardGrid {
  const result = WALK_FORWARD_GRID_SCHEMA.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new WalkForwardError({
    code: WALK_FORWARD_ERROR_CODE.INVALID_GRID,
    message: `Grade inválida em "${issue?.path.join('.') ?? ''}": ${issue?.message ?? 'formato'}`,
  });
}
