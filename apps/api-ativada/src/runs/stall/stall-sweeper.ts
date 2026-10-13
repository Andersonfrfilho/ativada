// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { StallCandidate, StallSession } from '@ativada/database';
import { ENGINE_TIMEFRAME, type EngineTimeframe } from '@ativada/strategy-engine';

import { buildResumeAlertPayload, buildStallAlertPayload } from './stall-alert-payload.js';
import { computeStalledSince } from './stall-policy.js';

export type StallSweepSummary = {
  // `false` = outra instância segurava a trava: nada foi lido nem gravado.
  readonly isAcquired: boolean;
  readonly opened: number;
  readonly closed: number;
  readonly cleared: number;
};

export type SweepStallsParams = {
  readonly session: StallSession;
  readonly now: number;
  readonly graceMinutes: number;
};

const NOT_ACQUIRED: StallSweepSummary = { isAcquired: false, opened: 0, closed: 0, cleared: 0 };

function toEngineTimeframe(value: string): EngineTimeframe | undefined {
  return Object.values(ENGINE_TIMEFRAME).find((timeframe) => timeframe === value);
}

type Transition = 'opened' | 'closed' | 'unchanged';

// Uma execução, uma decisão. O início gravado vale enquanto o episódio dura (P3): só a regra dizer "em dia" o encerra, e a
// espera por dado (que tem texto próprio) nem abre nem fecha episódio.
async function settleCandidate(
  params: SweepStallsParams,
  candidate: StallCandidate,
): Promise<Transition> {
  const timeframe = toEngineTimeframe(candidate.timeframe);
  if (timeframe === undefined) return 'unchanged';
  const dueSince = computeStalledSince({
    timeframe,
    lastCandleTime: candidate.lastCandleTime,
    startedAt: candidate.periodStart,
    now: params.now,
    graceMinutes: params.graceMinutes,
    waitingForData: candidate.isWaitingForData,
  });
  const openSince = candidate.stalledSince;
  if (openSince === undefined) {
    if (dueSince === undefined) return 'unchanged';
    const alertPayload = buildStallAlertPayload({ candidate, stalledSince: dueSince });
    const isOpened = await params.session.openEpisode({
      candidate,
      stalledSince: dueSince,
      alertPayload,
    });
    return isOpened ? 'opened' : 'unchanged';
  }
  if (dueSince !== undefined || candidate.isWaitingForData) return 'unchanged';
  const alertPayload = buildResumeAlertPayload({
    candidate,
    stalledSince: openSince,
    resumedAt: params.now,
  });
  return (await params.session.closeEpisode({ candidate, alertPayload })) ? 'closed' : 'unchanged';
}

// Uma ronda inteira numa sessão só (a transação do repositório): quem não pega a trava não faz nada.
export async function sweepStalls(params: SweepStallsParams): Promise<StallSweepSummary> {
  const { session } = params;
  if (!(await session.tryAcquireLock())) return NOT_ACQUIRED;
  const cleared = await session.clearInactiveEpisodes();
  const counts = { opened: 0, closed: 0 };
  for (const candidate of await session.listCandidates()) {
    // Em sequência de propósito: a transação é uma conexão só.
    const transition = await settleCandidate(params, candidate);
    if (transition !== 'unchanged') counts[transition] += 1;
  }
  return { isAcquired: true, ...counts, cleared };
}
