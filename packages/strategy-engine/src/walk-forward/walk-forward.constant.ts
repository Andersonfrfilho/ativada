// Copyright (c) 2026 Ada Technology. All rights reserved.

// Janelas padrão do RF08 (plan.md §5): 6 meses de ajuste, 2 de teste, passo de 2.
export const DEFAULT_TRAIN_MONTHS = 6;
export const DEFAULT_TEST_MONTHS = 2;
export const DEFAULT_STEP_MONTHS = 2;
// Um walk-forward com menos de três janelas não diz nada sobre estabilidade.
export const MIN_WALK_FORWARD_WINDOWS = 3;
export const MAX_WINDOW_MONTHS = 120;
export const MAX_PLANNED_WINDOWS = 1_000;

// Objetivo da busca (plan.md §5): Sharpe líquido de custos no AJUSTE, com no mínimo 10 operações fechadas.
export const DEFAULT_MIN_TRADES_PER_WINDOW = 10;

// Alerta de overfitting. Sharpe fora da amostra abaixo de 50% do de dentro (plan.md §5) é sinal de que a
// escolha no ajuste foi ruído; menos da metade das janelas com parâmetro elegível quer dizer que a busca
// quase nunca achou uma estratégia que opere o suficiente para ser avaliada.
export const OVERFITTING_DEGRADATION_LIMIT = '0.5';
export const MIN_ELIGIBLE_WINDOW_FRACTION = '0.5';

// Grade: o teto de combinações (200, RNF02) vem de `MAX_WALK_FORWARD_COMBINATIONS` e conta só as VÁLIDAS.
// O produto bruto também é limitado: enumerar milhões de combinações para descobrir que quase todas são
// inválidas seria o ataque de negação mais barato da API.
export const MAX_GRID_PARAMETERS = 6;
export const MAX_VALUES_PER_PARAMETER = 50;
export const MAX_RAW_GRID_COMBINATIONS = 5_000;

export const WINDOW_STATUS = {
  OK: 'ok',
  NO_ELIGIBLE_PARAMETERS: 'no_eligible_parameters',
} as const;
export type WindowStatus = (typeof WINDOW_STATUS)[keyof typeof WINDOW_STATUS];

export const WALK_FORWARD_ERROR_CODE = {
  INVALID_GRID: 'INVALID_GRID',
  GRID_TOO_LARGE: 'GRID_TOO_LARGE',
  NO_VALID_COMBINATIONS: 'NO_VALID_COMBINATIONS',
  INVALID_WINDOW_CONFIG: 'INVALID_WINDOW_CONFIG',
  PERIOD_TOO_SHORT: 'PERIOD_TOO_SHORT',
  INVALID_SELECTION_INPUT: 'INVALID_SELECTION_INPUT',
} as const;
export type WalkForwardErrorCode =
  (typeof WALK_FORWARD_ERROR_CODE)[keyof typeof WALK_FORWARD_ERROR_CODE];

// Encadeamento: o fator de escala (patrimônio carregado ÷ saldo inicial) fica com 20 casas e os valores
// escalados com 12 (as casas das métricas); nenhuma outra arredondagem acontece no encadeamento.
export const CHAIN_SCALE_DECIMAL_PLACES = 20;
export const CHAIN_VALUE_DECIMAL_PLACES = 12;

export const OVERFITTING_REASON = {
  SHARPE_BELOW_HALF_OF_IN_SAMPLE: 'sharpe_below_half_of_in_sample',
  NEGATIVE_OUT_OF_SAMPLE_WITH_POSITIVE_IN_SAMPLE: 'negative_out_of_sample_with_positive_in_sample',
  TOO_FEW_ELIGIBLE_WINDOWS: 'too_few_eligible_windows',
  OUT_OF_SAMPLE_UNDEFINED: 'out_of_sample_undefined',
} as const;
export type OverfittingReason = (typeof OVERFITTING_REASON)[keyof typeof OVERFITTING_REASON];

export const OVERFITTING_UNDEFINED_REASON = {
  NO_ELIGIBLE_WINDOWS: 'no_eligible_windows',
  NON_POSITIVE_IN_SAMPLE: 'non_positive_in_sample',
  UNDEFINED_OUT_OF_SAMPLE: 'undefined_out_of_sample',
} as const;
