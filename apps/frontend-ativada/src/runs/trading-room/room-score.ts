// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { formatScorePoints } from '../live-tracking/ScoreboardRuler.component.js';

type AvailableTriggers = Extract<LiveStatus['triggers'], { status: 'available' }>;

const MINUS = '−';

// Comprado, o limiar é o de VENDA (placar que cai a −N); à espera, o de compra (+N): o sinal vem do estado, não do texto.
export function describeScoreRule(triggers: AvailableTriggers): string {
  const magnitude = formatScorePoints(triggers.scoreThreshold.replace('-', ''), false);
  if (triggers.state === 'holding') return `vende a partir de ${MINUS}${magnitude}`;
  return `compra a partir de +${magnitude}`;
}

// "placar +4 · vende a partir de −2" ou "placar +1 · compra a partir de +2".
export function describeScore(triggers: LiveStatus['triggers']): string | undefined {
  if (triggers.status !== 'available') return undefined;
  return `placar ${formatScorePoints(triggers.score, true)} · ${describeScoreRule(triggers)}`;
}
