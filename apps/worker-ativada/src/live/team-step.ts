// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  appendDecisions,
  createBatchBuffer,
  parseJsonContainer,
  toRunResultRows,
} from '@ativada/run-recording';
import { serializeEngineState, type EngineCandle } from '@ativada/strategy-engine';

import type { TeamRunInputWrite } from '@ativada/database';
import { LIVE_COMMIT_OUTCOME, LIVE_PROGRESS } from './live.constant.js';
import type { PassRunStep, StepRun } from './live-step.js';
import type { LiveStepCommit } from './live-run.types.js';
import type { LiveCursor } from './resolve-live-cursor.js';
import { collectStepAlerts } from './step-alerts.js';
import {
  finishTeamCandle,
  computeRealSignal,
  type TeamCandleInputs,
  type TeamCandleStep,
} from './team-candle-step.js';
import { resolveTeamDecision, type ReadyTeamDecision, type TeamRunKit } from './team-decision.js';

export type TeamStepRun = StepRun & { readonly team: TeamRunKit };

function toInputs(run: TeamStepRun, cursor: LiveCursor, candle: EngineCandle): TeamCandleInputs {
  const { context } = run;
  return {
    engine: run.engine,
    strategy: context.strategy,
    setup: context.setup,
    state: cursor.state,
    candle,
    previousOpenTime: cursor.previousOpenTime,
    durationMilliseconds: context.durationMilliseconds,
    pickSentiment: run.pickSentiment,
  };
}

// O que ficou decidido para a vela, gravado NA transação do passo: o replay lê daqui e nunca do relógio ou do provedor.
function toTeamInput(params: {
  readonly candle: EngineCandle;
  readonly decision: ReadyTeamDecision;
  readonly step: TeamCandleStep;
}): TeamRunInputWrite | undefined {
  const { decision, step } = params;
  if (decision.isStored || step.teamSignal === undefined) return undefined;
  return {
    candleTime: params.candle.openTime,
    reportId: decision.reportId,
    failureCode: decision.failureCode,
    appliedAction: step.teamSignal.action.toLowerCase(),
  };
}

async function commitTeamStep(
  run: TeamStepRun,
  params: {
    readonly candle: EngineCandle;
    readonly step: TeamCandleStep;
    readonly teamInput: TeamRunInputWrite | undefined;
  },
): Promise<PassRunStep['commit']> {
  const { candle, step } = params;
  const { result } = step;
  const buffer = createBatchBuffer();
  appendDecisions({ buffer, decisions: result.decisions, tracker: run.tracker });
  const commit: LiveStepCommit = {
    alerts: await collectStepAlerts({
      alerting: run.alerting,
      readHitRate: run.readHitRate,
      candle,
      result,
      durationMilliseconds: run.context.durationMilliseconds,
    }),
    rows: toRunResultRows(buffer),
    checkpoint: {
      engineState: parseJsonContainer(serializeEngineState(result.state)),
      lastCandleTime: candle.openTime,
      progress: LIVE_PROGRESS,
    },
    ...(run.waiting.isPending ? { shouldClearWait: true } : {}),
    ...(params.teamInput === undefined ? {} : { teamInput: params.teamInput }),
  };
  const outcome = await run.session.commitStep(commit);
  if (outcome === LIVE_COMMIT_OUTCOME.COMMITTED) run.waiting.isPending = false;
  return outcome;
}

// O passo de uma execução de equipe (plan D9). Sem decisão e dentro do prazo, devolve SEM commit (`awaiting_team`) e a ronda
// seguinte tenta de novo: nunca dorme nem segura transação. A ordem executa em `t + 1`; o aquecimento segue sem sinal.
export async function stepTeamOnce(
  run: TeamStepRun,
  cursor: LiveCursor,
  candle: EngineCandle,
): Promise<PassRunStep> {
  const inputs = toInputs(run, cursor, candle);
  const real = computeRealSignal(inputs);
  const decision = real.signal === null ? undefined : await resolveTeamDecision(run.team, candle);
  if (decision?.kind === 'awaiting') {
    return { commit: LIVE_COMMIT_OUTCOME.AWAITING_TEAM, next: cursor };
  }
  const step = finishTeamCandle(inputs, { real, record: decision?.record ?? null });
  const teamInput = decision === undefined ? undefined : toTeamInput({ candle, decision, step });
  const commit = await commitTeamStep(run, { candle, step, teamInput });
  return {
    commit,
    next: { state: step.result.state, previousOpenTime: candle.openTime },
  };
}
