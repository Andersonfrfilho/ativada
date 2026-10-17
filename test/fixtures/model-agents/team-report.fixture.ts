// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamAction, TeamReport } from '../../../packages/model-agents/src/index.js';

// Relatório coerente para o fechamento 100 do fixture dos testes de preço (entrada 100,5, alvo 102, proteção 99,5).
export function buildReport(action: TeamAction = 'buy'): TeamReport {
  const isBuy = action === 'buy';
  return {
    trend: { stance: 'up', reason: 'Três fechamentos acima da EMA de 21.' },
    risk: { level: 'medium', reason: 'Volume 1,3 vez a média.' },
    decision: {
      action,
      entryPrice: isBuy ? '100.5' : null,
      targetPrice: isBuy ? '102' : null,
      stopPrice: isBuy ? '99.5' : null,
      confidence: 62,
      reason: 'Entrada na retomada da tendência.',
    },
  };
}
