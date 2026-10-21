// Copyright (c) 2026 Ada Technology. All rights reserved.
const FULL_PERCENT = 100;

export type OutcomeSegments = {
  readonly reached: number;
  readonly stopped: number;
  readonly neither: number;
};

function toPercent(rate: string | null): number {
  if (rate === null) return 0;
  const value = Number(rate) * FULL_PERCENT;
  if (!Number.isFinite(value)) return 0;
  return Math.min(FULL_PERCENT, Math.max(0, value));
}

// Só para desenhar a barra: o texto ao lado traz os números do servidor.
export function computeOutcomeSegments(
  reachRate: string | null,
  stopRate: string | null,
): OutcomeSegments {
  const reached = toPercent(reachRate);
  const stopped = Math.min(toPercent(stopRate), FULL_PERCENT - reached);
  return { reached, stopped, neither: FULL_PERCENT - reached - stopped };
}

export function describeOutcomeBar(segments: OutcomeSegments): string {
  const reached = Math.round(segments.reached);
  const stopped = Math.round(segments.stopped);
  return `A cada 100 tentativas no passado: ${reached} chegaram ao alvo, ${stopped} pararam na perda máxima e ${
    FULL_PERCENT - reached - stopped
  } terminaram sem chegar a nenhum dos dois.`;
}
