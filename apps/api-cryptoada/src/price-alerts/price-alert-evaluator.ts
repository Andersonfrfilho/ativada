// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PriceAlertEvaluationRepository } from '@cryptoada/database';
import type { PriceTickListener } from '@cryptoada/market-data';

export type PriceAlertEvaluatorParams = {
  readonly repository: Pick<PriceAlertEvaluationRepository, 'fireDueAlerts'>;
  readonly now: () => number;
  // Tick mais velho que isto não avalia nada: o painel mostraria "sem dados", e o alerta não dispara com preço parado.
  readonly staleAfterMilliseconds: number;
  // Intervalo mínimo entre dois disparos do MESMO alerta, mesmo religado: sem ele, religar em laço gera um aviso por ciclo.
  readonly minimumRefireMilliseconds: number;
};

// Avalia os alertas LIGADOS do par a cada tick agregado (RF14, ADR 0002 §"Alerta de preço no tick"): o cliente nunca decide.
// A API é quem tem o ticker público; o disparo é atômico no banco, então duas instâncias nunca avisam duas vezes.
export function createPriceAlertEvaluator(params: PriceAlertEvaluatorParams): PriceTickListener {
  return {
    onTick: async (tick): Promise<void> => {
      if (params.now() - tick.eventTime > params.staleAfterMilliseconds) return;
      await params.repository.fireDueAlerts({
        symbol: tick.symbol,
        price: tick.price,
        eventTime: tick.eventTime,
        minimumRefireMilliseconds: params.minimumRefireMilliseconds,
      });
    },
  };
}
