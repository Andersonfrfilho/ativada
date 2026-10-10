// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from 'zod';

import type { RUN_PARAMETERS_SCHEMA } from './run-parameters.schema.js';
import type { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
import type { STRATEGY_RULE_SCHEMA } from './strategy-rule.schema.js';

export type StrategyConfig = z.output<typeof STRATEGY_CONFIG_SCHEMA>;
export type StrategyConfigInput = z.input<typeof STRATEGY_CONFIG_SCHEMA>;
export type StrategyRule = z.output<typeof STRATEGY_RULE_SCHEMA>;
export type RiskConfig = StrategyConfig['risk'];
export type EntryConfig = StrategyConfig['entry'];
export type RegimeConfig = StrategyConfig['regime'];

export type RunParameters = z.output<typeof RUN_PARAMETERS_SCHEMA>;
export type RunParametersInput = z.input<typeof RUN_PARAMETERS_SCHEMA>;
export type EngineMarket = Pick<RunParameters, 'symbol' | 'timeframe'>;

// A versão da estratégia (lógica) e o hash que prende resultados a ela (RF03).
export type StrategyVersion = {
  readonly config: StrategyConfig;
  readonly configHash: string;
};

// Os parâmetros da execução e o hash deles, guardado no estado ao lado do `configHash`.
export type RunSetup = {
  readonly parameters: RunParameters;
  readonly runHash: string;
};
