// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createStrategyVersion, type StrategyVersion } from '@ativada/strategy-engine';

export const MODEL_TEAM_STRATEGY_NAME = 'model-team-1';

// D9: a versão fixa que a execução de equipe usa para a carteira. A regra (período ≤ ATR) só existe para o `signalStep`
// calcular os indicadores, ATR do risco incluído; o sinal dela é descartado e quem decide é a linha gravada da equipe.
// Stop e alvo vêm do risco abaixo, não do relatório (opção A).
export const MODEL_TEAM_STRATEGY_CONFIG = {
  schemaVersion: 1,
  rules: [{ id: 'rsi-2', kind: 'rsi', period: 2, oversold: 30, overbought: 70 }],
  regime: { kind: 'none' },
  thresholds: { buy: '1', sell: '-1' },
  entry: { orderType: 'market' },
  risk: {
    atrPeriod: 14,
    stopAtrMultiple: '2',
    targetAtrMultiple: '3',
    riskPerTrade: '0.01',
    maxExposureRate: '1',
  },
} as const;

export const MODEL_TEAM_STRATEGY: StrategyVersion = createStrategyVersion(
  MODEL_TEAM_STRATEGY_CONFIG,
);
