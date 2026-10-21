// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, RunResultRepository } from '@ativada/database';
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';

import { RunNotFoundError } from '../run.error.js';
import { buildTradeSummaryMessage } from './trade-summary-message.js';

export type TradeSummaryDependencies = {
  readonly results: Pick<RunResultRepository, 'readTradeTotals'>;
};

export type TradeSummaryView = {
  readonly closedTrades: number;
  readonly totalPaid: string;
  readonly totalReceived: string;
  readonly totalFees: string;
  // Recebido - pago: é exatamente a soma de `net_profit` das posições fechadas (o caixa do motor garante).
  readonly net: string;
  readonly openTrades: number;
  readonly openPaid: string | null;
  readonly message: string;
};

export type TradeSummaryUseCase = (scope: OwnerScope, runId: string) => Promise<TradeSummaryView>;

const canonical = (text: string): string => formatEngineDecimal(new EngineDecimal(text));

// O resumo da execução INTEIRA (não muda com o zoom): uma consulta agregada e a frase. `undefined` do repositório é
// execução alheia, inexistente ou apagada: o mesmo `RUN_NOT_FOUND`.
export function createTradeSummaryUseCase(
  dependencies: TradeSummaryDependencies,
): TradeSummaryUseCase {
  return async (scope, runId) => {
    const totals = await dependencies.results.readTradeTotals(scope, runId);
    if (totals === undefined) throw new RunNotFoundError();
    const totalPaid = canonical(totals.totalPaid);
    const totalReceived = canonical(totals.totalReceived);
    const numbers = {
      closedTrades: totals.closedTrades,
      totalPaid,
      totalReceived,
      totalFees: canonical(totals.totalFees),
      net: formatEngineDecimal(new EngineDecimal(totalReceived).minus(totalPaid)),
      openTrades: totals.openTrades,
      openPaid: totals.openPaid === undefined ? undefined : canonical(totals.openPaid),
    };
    return {
      ...numbers,
      openPaid: numbers.openPaid ?? null,
      message: buildTradeSummaryMessage(numbers),
    };
  };
}
