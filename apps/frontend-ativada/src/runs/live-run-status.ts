// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatMomentSkippingToday,
  formatRelativeMoment,
  type MomentContext,
} from '../format/zoned-moment.js';
import { CANDLE_DURATION_MILLISECONDS } from '../goals/next-candle-close.js';
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
  | 'periodStart'
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

// `periodStart` é a abertura da vela em curso quando a simulação nasceu (a API a alinha ao timeframe): a primeira vela avaliada
// fecha uma duração depois. As velas do aquecimento têm abertura ANTERIOR a ela e não contam como decisão.
function describeFirstCandle(
  run: LiveRunStatusInput,
  timeframe: SimulationTimeframe,
  context: MomentContext,
): LiveRunState {
  const closeAt = run.periodStart + CANDLE_DURATION_MILLISECONDS[timeframe];
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

// O worker grava como passos as velas do aquecimento: só vale como decisão a vela aberta a partir de `periodStart`.
function readDecidedCandleTime(run: LiveRunStatusInput): number | undefined {
  const lastCandleTime = run.lastCandleTime;
  if (lastCandleTime === null || lastCandleTime === undefined) return undefined;
  return lastCandleTime >= run.periodStart ? lastCandleTime : undefined;
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
  const decidedCandleTime = readDecidedCandleTime(run);
  if (decidedCandleTime === undefined) return describeFirstCandle(run, run.timeframe, context);
  return describeRunning(decidedCandleTime, run.timeframe, context);
}
