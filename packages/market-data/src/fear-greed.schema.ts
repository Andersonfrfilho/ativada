// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import type { FearGreedPoint } from './fear-greed.types.js';
import { MILLISECONDS_PER_SECOND } from './market-data.constant.js';
import { MarketDataResponseError, MarketDataSourceError } from './market-data.error.js';

const INTEGER_TEXT_PATTERN = /^\d{1,12}$/;
const MAXIMUM_INDEX_VALUE = 100;
// 9999-12-31T23:59:59Z: acima disso a data deixa de ser representável.
const MAXIMUM_TIMESTAMP_SECONDS = 253_402_300_799;
const DATE_LENGTH = 'AAAA-MM-DD'.length;

const integerText = z.string().regex(INTEGER_TEXT_PATTERN).transform(Number);

const itemSchema = z.object({
  value: integerText.pipe(z.number().max(MAXIMUM_INDEX_VALUE)),
  value_classification: z.string(),
  timestamp: integerText.pipe(z.number().max(MAXIMUM_TIMESTAMP_SECONDS)),
  time_until_update: z.string().optional(),
});
const envelopeSchema = z.object({ metadata: z.object({ error: z.unknown() }) });
const responseSchema = z.object({ data: z.array(itemSchema) });

function describeIssues(error: z.ZodError): string {
  const paths = error.issues.map((issue) => issue.path.join('.')).slice(0, 3);
  return `Resposta do índice Fear & Greed fora do formato esperado (campos: ${paths.join(', ')}).`;
}

function toDate(timestampSeconds: number): string {
  return new Date(timestampSeconds * MILLISECONDS_PER_SECOND).toISOString().slice(0, DATE_LENGTH);
}

type TimestampedPoint = FearGreedPoint & { readonly timestamp: number };

function keepMostRecentPerDate(points: readonly TimestampedPoint[]): readonly FearGreedPoint[] {
  const byDate = new Map<string, TimestampedPoint>();
  for (const point of points) {
    const kept = byDate.get(point.date);
    if (kept === undefined || point.timestamp > kept.timestamp) byDate.set(point.date, point);
  }
  return [...byDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map(({ date, value, classification }) => ({ date, value, classification }));
}

// Nenhuma mensagem de erro repete o corpo recebido: só o caminho dos campos quebrados.
export function parseFearGreedResponse(body: unknown): readonly FearGreedPoint[] {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) throw new MarketDataResponseError(describeIssues(envelope.error));
  if (envelope.data.metadata.error !== null)
    throw new MarketDataSourceError('A fonte do índice Fear & Greed informou um erro.');
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new MarketDataResponseError(describeIssues(parsed.error));
  return keepMostRecentPerDate(
    parsed.data.data.map((item) => ({
      date: toDate(item.timestamp),
      value: item.value,
      classification: item.value_classification,
      timestamp: item.timestamp,
    })),
  );
}
