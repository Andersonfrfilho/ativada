// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatMomentSkippingToday,
  formatRelativeMoment,
  type MomentContext,
} from '../format/zoned-moment.js';
import { CANDLE_DURATION_MILLISECONDS, nextCandleClose } from '../goals/next-candle-close.js';
import {
  isSimulationTimeframe,
  SIMULATION_EVERY_TEXT,
  type SimulationTimeframe,
} from '../goals/simulation-timeframe.constant.js';
import { RUN_KIND, RUN_STATUS } from './run.constant.js';
import type { RunDetail } from './run.validation.js';

export type LiveRunStatusInput = Pick<
  RunDetail,
  | 'kind'
  | 'status'
  | 'timeframe'
  | 'createdAt'
  | 'startedAt'
  | 'lastCandleTime'
  | 'waitingForData'
  | 'stalledSince'
>;

export type LiveRunState =
  | { readonly kind: 'none' }
  | { readonly kind: 'stalled'; readonly text: string }
  | { readonly kind: 'waitingForData'; readonly since: number }
  | { readonly kind: 'waitingFirstCandle'; readonly text: string }
  | { readonly kind: 'running'; readonly text: string };

const NONE: LiveRunState = { kind: 'none' };

export function buildStalledText(stalledSince: number, context: MomentContext): string {
  return `Sua simulação está parada desde ${formatMomentSkippingToday(stalledSince, context)}. O sistema está tentando retomar; nenhuma operação foi perdida.`;
}

// O fim da vela em curso quando a simulação nasceu: a mesma conta da API (`computeStalledSince`).
function describeFirstCandle(
  run: LiveRunStatusInput,
  timeframe: SimulationTimeframe,
  context: MomentContext,
): LiveRunState {
  const startedAt = Date.parse(run.startedAt ?? run.createdAt);
  const closeAt = nextCandleClose({ timeframe, now: startedAt });
  const verb = closeAt > context.now ? 'fecha' : 'fechou';
  return {
    kind: 'waitingFirstCandle',
    text: `Aguardando a primeira vela, que ${verb} às ${formatRelativeMoment(closeAt, context)}.`,
  };
}

// A decisão acontece no fechamento da vela: a última foi a da vela já processada, a próxima é a seguinte.
function describeRunning(
  lastCandleTime: number,
  timeframe: SimulationTimeframe,
  context: MomentContext,
): LiveRunState {
  const duration = CANDLE_DURATION_MILLISECONDS[timeframe];
  const last = formatRelativeMoment(lastCandleTime + duration, context);
  const next = formatRelativeMoment(lastCandleTime + 2 * duration, context);
  return {
    kind: 'running',
    text: `Olha o mercado ${SIMULATION_EVERY_TEXT[timeframe]}. Última decisão às ${last} · próxima às ${next}.`,
  };
}

// Só a simulação ao vivo na fila ou rodando tem estado; a parada vem do servidor (`stalledSince`) e vale sobre o resto.
export function deriveLiveRunState(run: LiveRunStatusInput, context: MomentContext): LiveRunState {
  if (run.kind !== RUN_KIND.LIVE_PAPER) return NONE;
  if (run.status !== RUN_STATUS.RUNNING && run.status !== RUN_STATUS.QUEUED) return NONE;
  if (run.stalledSince !== undefined) {
    return { kind: 'stalled', text: buildStalledText(run.stalledSince, context) };
  }
  if (run.waitingForData !== null) {
    return { kind: 'waitingForData', since: run.waitingForData.since };
  }
  if (!isSimulationTimeframe(run.timeframe)) return NONE;
  if (run.lastCandleTime === null || run.lastCandleTime === undefined) {
    return describeFirstCandle(run, run.timeframe, context);
  }
  return describeRunning(run.lastCandleTime, run.timeframe, context);
}
