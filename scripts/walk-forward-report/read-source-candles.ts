// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import { SOURCE_EXCHANGE } from './report.constant.js';

export type ReadSourceCandlesParams = {
  readonly sourceUrl: string;
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly fromTime: number;
  // Só candle com fechamento anterior a este instante (o candle aberto nunca entra).
  readonly cutoffTime: number;
};

type CandleRow = {
  readonly open_time: string;
  readonly close_time: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
};

// Somente SELECT, em transação READ ONLY: a base de origem (a da simulação ao vivo) nunca é alterada.
export async function readSourceCandles(
  params: ReadSourceCandlesParams,
): Promise<readonly EngineCandle[]> {
  const sql = new Bun.SQL(params.sourceUrl);
  try {
    const rows = await sql.begin('read only', async (transaction) => {
      return await transaction<CandleRow[]>`
        SELECT open_time, close_time, open::text, high::text, low::text, close::text, volume::text
        FROM candles
        WHERE exchange = ${SOURCE_EXCHANGE} AND symbol = ${params.symbol}
          AND timeframe = ${params.timeframe} AND open_time >= ${params.fromTime}
          AND close_time < ${params.cutoffTime}
        ORDER BY open_time ASC`;
    });
    return rows.map((row) => ({
      symbol: params.symbol,
      timeframe: params.timeframe,
      openTime: Number(row.open_time),
      closeTime: Number(row.close_time),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    }));
  } finally {
    await sql.close();
  }
}
