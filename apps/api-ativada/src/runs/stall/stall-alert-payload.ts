// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, StallCandidate } from '@ativada/database';

// O que vai em `alerts.payload` do aviso de parada e de volta: o par, a vela e os horários (ms UTC). Nada da pessoa, nem
// o nome da estratégia, nem id, nem chat: o despachante do worker monta o texto só com isto.
export function buildStallAlertPayload(params: {
  readonly candidate: StallCandidate;
  readonly stalledSince: number;
}): JsonContainer {
  const { candidate, stalledSince } = params;
  return { symbol: candidate.symbol, timeframe: candidate.timeframe, stalledSince };
}

export function buildResumeAlertPayload(params: {
  readonly candidate: StallCandidate;
  readonly stalledSince: number;
  readonly resumedAt: number;
}): JsonContainer {
  const { candidate, stalledSince, resumedAt } = params;
  return { symbol: candidate.symbol, timeframe: candidate.timeframe, stalledSince, resumedAt };
}
