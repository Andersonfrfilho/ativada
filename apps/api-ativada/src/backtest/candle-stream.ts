// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '@ativada/strategy-engine';

import { BACKTEST_ERROR_CODE } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';
import type { BacktestRunSession } from './backtest-database.types.js';
import type { BacktestContext } from './load-backtest-context.js';

export type CandlePages = AsyncGenerator<readonly EngineCandle[], void, undefined>;

export type ReadPagesParams = {
  readonly session: BacktestRunSession;
  readonly from: number;
  readonly to: number;
  readonly pageCandles: number;
  readonly durationMilliseconds: number;
};

// Uma consulta POR PÁGINA (janela de tempo de `pageCandles` candles), nunca uma por candle nem tudo de uma vez.
// Página vazia (buraco maior que a página) é pulada.
export async function* readCandlePages(params: ReadPagesParams): CandlePages {
  const span = params.pageCandles * params.durationMilliseconds;
  for (let from = params.from; from < params.to; from += span) {
    const page = await params.session.findCandles({ from, to: Math.min(from + span, params.to) });
    if (page.length > 0) yield page;
  }
}

export type OpenStreamParams = {
  readonly session: BacktestRunSession;
  readonly context: BacktestContext;
  readonly pageCandles: number;
};

async function* chainPages(
  head: readonly (readonly EngineCandle[])[],
  tail: CandlePages,
): CandlePages {
  for (const page of head) if (page.length > 0) yield page;
  yield* tail;
}

// Largada nova: confere ANTES de qualquer passo ou gravação que há candle no período e candles para o aquecimento
// completo; a falta de um ou de outro é uma falha tipada, nunca um resultado calculado sobre menos dados.
export async function openFreshCandleStream(params: OpenStreamParams): Promise<CandlePages> {
  const { session, context } = params;
  const leadIn = await session.findCandles({ from: context.loadStart, to: context.periodStart });
  const pages = readCandlePages({
    session,
    from: context.periodStart,
    to: context.periodEnd,
    pageCandles: params.pageCandles,
    durationMilliseconds: context.durationMilliseconds,
  });
  const first = await pages.next();
  if (first.done === true) {
    throw new BacktestError(BACKTEST_ERROR_CODE.NO_CANDLES, 'Nenhum candle fechado no período.');
  }
  if (leadIn.length < context.leadInCandles) {
    throw new BacktestError(
      BACKTEST_ERROR_CODE.INSUFFICIENT_HISTORY,
      `Histórico insuficiente para o aquecimento: ${leadIn.length} de ${context.leadInCandles} candles.`,
    );
  }
  return chainPages([leadIn, first.value], pages);
}

export type ResumeStreamParams = OpenStreamParams & { readonly afterCandleTime: number };

// Retomada: o estado do motor já traz o aquecimento; só se leem os candles depois do checkpoint.
export function openResumedCandleStream(params: ResumeStreamParams): CandlePages {
  const { context } = params;
  return readCandlePages({
    session: params.session,
    from: params.afterCandleTime + context.durationMilliseconds,
    to: context.periodEnd,
    pageCandles: params.pageCandles,
    durationMilliseconds: context.durationMilliseconds,
  });
}
