// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository, RunRecord } from '@cryptoada/database';
import { parseRunParameters, warnRunParameters } from '@cryptoada/strategy-engine';

import type { RunWarning } from './run-view.js';

export type RunWarningDependencies = {
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly exchange: string;
};

type WarnableRun = Pick<RunRecord, 'symbol' | 'timeframe' | 'periodStart' | 'runParameters'>;

const FIRST_CANDLE_ONLY = 1;

// Avisos do `warnRunParameters` (tick, passo, mínimo e custos zero) contra o PREÇO DO PRIMEIRO CANDLE DO PERÍODO:
// o mesmo cálculo na criação e na leitura da execução. Sem candle no período não há preço de referência e a
// execução simplesmente não traz avisos de preço.
export async function readRunWarnings(
  dependencies: RunWarningDependencies,
  run: WarnableRun,
): Promise<readonly RunWarning[]> {
  const parameters = parseRunParameters(run.runParameters);
  const [first] = await dependencies.candles.findCandles({
    exchange: dependencies.exchange,
    symbol: run.symbol,
    timeframe: parameters.timeframe,
    from: run.periodStart,
    to: Number.MAX_SAFE_INTEGER,
    limit: FIRST_CANDLE_ONLY,
  });
  if (first === undefined) return [];
  return warnRunParameters(parameters, first.open).map(({ code, message }) => ({ code, message }));
}
