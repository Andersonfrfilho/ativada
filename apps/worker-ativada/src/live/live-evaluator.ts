// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createEngine } from '@ativada/strategy-engine';

import { LIVE_LOG, LIVE_MAX_STEPS_PER_PASS, LIVE_PASS_KIND } from './live.constant.js';
import type {
  LiveEvaluator,
  LiveEvaluatorDependencies,
  LivePassOutcome,
  LiveTickSummary,
} from './live-run.types.js';
import { createAnalystSeriesCache } from './analyst-series-cache.js';
import { evaluateLiveRun } from './evaluate-live-run.js';

type RunRoster = Set<string>;

async function refreshRoster(
  dependencies: LiveEvaluatorDependencies,
  roster: RunRoster,
): Promise<void> {
  const { claims, instanceId, logger } = dependencies;
  const renewed = await claims.renewHeartbeat({ claimedBy: instanceId, runIds: [...roster] });
  for (const runId of renewed.lost) logger.warn(LIVE_LOG.RUN_LOST, { runId });
  // Fica só o que ainda é desta instância: a que outro worker tomou ou que terminou sai da lista.
  roster.clear();
  for (const runId of renewed.held) roster.add(runId);
}

async function claimNewRuns(
  dependencies: LiveEvaluatorDependencies,
  roster: RunRoster,
): Promise<number> {
  const claimed = await dependencies.claims.claimLiveRuns({
    claimedBy: dependencies.instanceId,
    heartbeatTimeoutSeconds: dependencies.heartbeatTimeoutSeconds,
  });
  for (const item of claimed) {
    roster.add(item.runId);
    dependencies.logger.info(item.isTakeover ? LIVE_LOG.RUN_TAKEN_OVER : LIVE_LOG.RUN_CLAIMED, {
      runId: item.runId,
    });
  }
  return claimed.length;
}

function summarize(claimed: number, outcomes: readonly LivePassOutcome[]): LiveTickSummary {
  const countOf = (kind: LivePassOutcome['kind']): number =>
    outcomes.filter((item) => item.kind === kind).length;
  return {
    claimed,
    evaluated: outcomes.length,
    steps: outcomes.reduce((sum, item) => sum + item.steps, 0),
    ended: countOf(LIVE_PASS_KIND.ENDED),
    failed: countOf(LIVE_PASS_KIND.FAILED),
  };
}

// O avaliador não guarda estado da simulação: só quais execuções esta instância detém. Tudo o mais vem do banco a cada
// ronda, então um worker novo continua exatamente de onde o outro parou.
export function createLiveEvaluator(dependencies: LiveEvaluatorDependencies): LiveEvaluator {
  const roster: RunRoster = new Set();
  const engine = dependencies.engine ?? createEngine();
  const maxSteps = dependencies.maxStepsPerPass ?? LIVE_MAX_STEPS_PER_PASS;
  // Uma série de velas por par, dividida entre as simulações com analista da MESMA instância (A3).
  const analystSeries = createAnalystSeriesCache();
  return {
    tick: async (): Promise<LiveTickSummary> => {
      await dependencies.claims.cancelLiveRunsOfInactiveOwners();
      await refreshRoster(dependencies, roster);
      const claimed = await claimNewRuns(dependencies, roster);
      const outcomes = await Promise.all(
        [...roster].map((runId) =>
          evaluateLiveRun({ dependencies, engine, maxSteps, runId, analystSeries }),
        ),
      );
      return summarize(claimed, outcomes);
    },
    release: async (): Promise<number> => {
      const released = await dependencies.claims.releaseClaimedRuns({
        claimedBy: dependencies.instanceId,
      });
      roster.clear();
      dependencies.logger.info(LIVE_LOG.RELEASED, { released });
      return released;
    },
  };
}
