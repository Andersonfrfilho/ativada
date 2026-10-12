// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '@ativada/strategy-engine';

import { WALK_FORWARD_CANDLE_PAGE, WALK_FORWARD_ERROR_CODE } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';
import {
  countGapsBefore,
  firstIndexAtOrAfter,
  pickSentiments,
  type CandleSeries,
} from './candle-series.js';
import type { WalkForwardContext } from './load-walk-forward-context.js';
import type { WalkForwardRunSession } from './walk-forward-database.types.js';

// Uma consulta POR PÁGINA (janela de tempo de WALK_FORWARD_CANDLE_PAGE candles), nunca uma por candle.
async function readAllCandles(params: {
  readonly session: WalkForwardRunSession;
  readonly from: number;
  readonly to: number;
  readonly span: number;
}): Promise<EngineCandle[]> {
  const candles: EngineCandle[] = [];
  for (let from = params.from; from < params.to; from += params.span) {
    const page = await params.session.findCandles({
      from,
      to: Math.min(from + params.span, params.to),
    });
    candles.push(...page);
  }
  return candles;
}

function assertHistory(params: {
  readonly context: WalkForwardContext;
  readonly candles: readonly EngineCandle[];
}): void {
  const { context, candles } = params;
  const first = context.windows[0];
  const last = context.windows.at(-1);
  if (first === undefined || last === undefined) return;
  const startIndex = firstIndexAtOrAfter(candles, first.trainStart);
  const endIndex = firstIndexAtOrAfter(candles, last.testEnd);
  if (endIndex <= startIndex) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.NO_CANDLES,
      'Nenhum candle fechado no período.',
    );
  }
  if (startIndex < context.maxLeadInCandles) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.INSUFFICIENT_HISTORY,
      `Histórico insuficiente para o aquecimento: ${startIndex} de ${context.maxLeadInCandles} candles.`,
    );
  }
}

// Carrega UMA vez o período todo (do aquecimento da combinação mais exigente ao fim do último teste) e confere,
// ANTES de qualquer passo ou gravação, que há candle e histórico: calcular sobre menos dados é pior que falhar.
export async function loadCandleSeries(params: {
  readonly session: WalkForwardRunSession;
  readonly context: WalkForwardContext;
}): Promise<CandleSeries> {
  const { session, context } = params;
  const first = context.windows[0];
  const last = context.windows.at(-1);
  if (first === undefined || last === undefined) {
    throw new WalkForwardRunError(
      WALK_FORWARD_ERROR_CODE.PERIOD_TOO_SHORT,
      'Nenhuma janela no plano.',
    );
  }
  const candles = await readAllCandles({
    session,
    from: first.trainLeadInStart,
    to: last.testEnd,
    span: WALK_FORWARD_CANDLE_PAGE * context.durationMilliseconds,
  });
  assertHistory({ context, candles });
  const lastCandle = candles.at(-1);
  const observations = await session.listSentiment({
    source: context.setup.parameters.sentimentSource,
    until: lastCandle?.closeTime ?? last.testEnd,
  });
  return {
    candles,
    gaps: countGapsBefore(candles, context.durationMilliseconds),
    sentiments: pickSentiments({
      candles,
      observations,
      source: context.setup.parameters.sentimentSource,
    }),
    durationMilliseconds: context.durationMilliseconds,
  };
}
