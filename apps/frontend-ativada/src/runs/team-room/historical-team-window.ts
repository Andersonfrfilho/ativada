// Copyright (c) 2026 Ada Technology. All rights reserved.

// Quantas decisões uma consulta traz: o teto da rota. Apontar velas vizinhas reaproveita a mesma resposta.
export const HISTORICAL_WINDOW_CANDLES = 100;

// A janela de decisões que cobre a vela apontada: termina no fim do bloco de 100 velas da execução em que ela cai (o bloco
// alinhado ao relógio, então toda vela do bloco está na mesma resposta). Sem vela apontada, nenhuma âncora (a mais recente).
export function windowAnchorFor(
  pointedOpenTime: number | undefined,
  durationMilliseconds: number | undefined,
): number | undefined {
  if (pointedOpenTime === undefined) return undefined;
  if (durationMilliseconds === undefined) return pointedOpenTime;
  const span = HISTORICAL_WINDOW_CANDLES * durationMilliseconds;
  return (Math.floor(pointedOpenTime / span) + 1) * span - 1;
}
