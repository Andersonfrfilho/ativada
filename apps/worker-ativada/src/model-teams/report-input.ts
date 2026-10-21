// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CandleRecord,
  CandleRepository,
  SentimentObservationRepository,
  TeamReportRepository,
} from '@ativada/database';
import {
  PROMPT_CANDLE_COUNT,
  PROMPT_TIMEFRAME,
  teamPromptInputSchema,
  type TeamPromptInput,
} from '@ativada/model-agents';

import { MODEL_TEAM_CANDLE_MILLISECONDS } from './model-teams.constant.js';

const FEAR_GREED_SOURCE = 'alternative.me';
const NO_READINGS = {
  relativeVolume: null,
  atrRate: null,
  atrPercentile90: null,
  atrPercentile95: null,
  momentumShort: null,
  momentumLong: null,
} as const;

export type ReportInputSources = {
  readonly exchange: string;
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly sentiment: Pick<SentimentObservationRepository, 'findAvailableAt'>;
  readonly reports: Pick<TeamReportRepository, 'readPublicReadings'>;
};

export type LoadedReportInput = {
  readonly input: TeamPromptInput;
  // Fechamento da última vela: a coerência dos preços do relatório é conferida contra ele.
  readonly lastClose: string;
};

function toCandleTuple(candle: CandleRecord): TeamPromptInput['candles'][number] {
  return [candle.openTime, candle.open, candle.high, candle.low, candle.close, candle.volume];
}

// Só dado PÚBLICO de mercado (RF09): as 48 velas até `t`, as leituras públicas do analista naquela vela e o Fear & Greed
// disponível no fechamento de `t`. Nada de usuário, simulação, posição ou saldo. `undefined` = a vela de `t` não está gravada.
export async function loadReportInput(
  sources: ReportInputSources,
  params: { readonly symbol: string; readonly candleTime: number },
): Promise<LoadedReportInput | undefined> {
  const { symbol, candleTime } = params;
  const closeBoundary = candleTime + MODEL_TEAM_CANDLE_MILLISECONDS;
  const records = await sources.candles.findCandles({
    exchange: sources.exchange,
    symbol,
    timeframe: PROMPT_TIMEFRAME,
    from: candleTime - (PROMPT_CANDLE_COUNT - 1) * MODEL_TEAM_CANDLE_MILLISECONDS,
    to: closeBoundary,
  });
  const last = records.at(-1);
  if (last?.openTime !== candleTime) return undefined;
  const readings =
    (await sources.reports.readPublicReadings({ symbol, candleTime })) ?? NO_READINGS;
  const fearGreed = await sources.sentiment.findAvailableAt({
    source: FEAR_GREED_SOURCE,
    observedUntil: closeBoundary,
    insertedUntil: new Date(closeBoundary),
  });
  const input = teamPromptInputSchema.parse({
    symbol,
    timeframe: PROMPT_TIMEFRAME,
    lastCandleCloseTime: new Date(closeBoundary).toISOString(),
    candles: records.map(toCandleTuple),
    readings,
    fearGreed:
      fearGreed === undefined
        ? null
        : { value: fearGreed.fearGreed, observedAt: new Date(fearGreed.observedAt).toISOString() },
  });
  return { input, lastClose: last.close };
}
