// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  type EngineTimeframe,
} from '@ativada/strategy-engine';

const MILLISECONDS_PER_MINUTE = 60_000;

export type ComputeStalledSinceParams = {
  readonly timeframe: EngineTimeframe;
  // Abertura da última vela processada; ausente enquanto a simulação não deu o primeiro passo.
  readonly lastCandleTime: number | undefined;
  readonly startedAt: number;
  readonly now: number;
  readonly graceMinutes: number;
  // Espera por dado já tem texto próprio e não conta como parada.
  readonly waitingForData: boolean;
};

// Fechamento da vela que o worker ainda deve processar: a seguinte à última passada ou, sem passo, a que estava em curso na criação.
function findDueAt(params: ComputeStalledSinceParams): number {
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.timeframe];
  const nextOpenTime =
    params.lastCandleTime === undefined
      ? Math.floor(params.startedAt / duration) * duration
      : params.lastCandleTime + duration;
  return nextOpenTime + duration;
}

// Início do episódio de parada (ms UTC) ou `undefined` em dia: fim da vela devida + carência, nunca o instante da varredura.
export function computeStalledSince(params: ComputeStalledSinceParams): number | undefined {
  if (params.waitingForData) return undefined;
  const stalledSince = findDueAt(params) + params.graceMinutes * MILLISECONDS_PER_MINUTE;
  return params.now >= stalledSince ? stalledSince : undefined;
}
