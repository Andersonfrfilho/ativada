// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '@ativada/strategy-engine';

// A duração da vela pelo texto do timeframe da execução; fora da tabela, o aviso fica sem horário derivado.
export function findCandleDuration(timeframe: string | undefined): number | undefined {
  const entry = Object.entries(ENGINE_TIMEFRAME_DURATION_MILLISECONDS).find(
    ([name]) => name === timeframe,
  );
  return entry?.[1];
}

export function toIsoInstant(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

export function addDuration(
  instant: number | undefined,
  timeframe: string | undefined,
): string | undefined {
  const duration = findCandleDuration(timeframe);
  if (instant === undefined || duration === undefined) return undefined;
  return toIsoInstant(instant + duration);
}
