// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { z } from '@cryptoada/environment';

import type { STRATEGY_CONFIG_SCHEMA } from './strategy-config.schema.js';
import type { STRATEGY_RULE_SCHEMA } from './strategy-rule.schema.js';

// Saída do parse: defaults preenchidos e decimais canônicos. É o que entra no hash e no motor.
export type StrategyConfig = z.output<typeof STRATEGY_CONFIG_SCHEMA>;
// O que o usuário (ou a API) envia antes dos defaults.
export type StrategyConfigInput = z.input<typeof STRATEGY_CONFIG_SCHEMA>;
export type StrategyRule = z.output<typeof STRATEGY_RULE_SCHEMA>;
export type ExecutionConfig = StrategyConfig['execution'];
export type RiskConfig = StrategyConfig['risk'];
export type EntryConfig = StrategyConfig['entry'];
export type RegimeConfig = StrategyConfig['regime'];

// Versão da estratégia como o motor a recebe: configuração já validada e o hash que a identifica.
export type StrategyVersion = {
  readonly config: StrategyConfig;
  readonly configHash: string;
};
