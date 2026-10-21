// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Decision } from '../live-tracking/live-status.validation.js';

// A decisão da vela que o gráfico aponta: a de mesma abertura ou, em outro tempo gráfico, a que cobre o instante.
// Sem vela apontada vale a mais recente (`decisions` vem da mais nova para a mais antiga).
export function pickDecisionForCandle(
  decisions: readonly Decision[],
  openTime: number | undefined,
): Decision | undefined {
  if (openTime === undefined) return decisions[0];
  return (
    decisions.find((decision) => decision.candleTime === openTime) ??
    decisions.find((decision) => decision.candleTime <= openTime && openTime < decision.closedAt)
  );
}
