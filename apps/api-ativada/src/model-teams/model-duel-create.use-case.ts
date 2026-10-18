// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  RUN_STATUS,
  type OwnerScope,
  type RunQueueRepository,
  type RunRepository,
  type UserModelTeamRepository,
} from '@ativada/database';
import { SIGNAL_SOURCE_KIND, type ModelTeamKey } from '@ativada/model-agents';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '@ativada/strategy-engine';

import type { CreateRunBody } from '../runs/create-run-request.schema.js';
import type { CreateRunUseCase } from '../runs/create-run.use-case.js';
import { LiveRunLimitReachedError } from '../runs/run.error.js';
import { ModelTeamDisabledError } from './model-team.error.js';
import type {
  CreateModelDuelBody,
  CreatedModelDuelView,
  DuelRunView,
} from './model-duel.schema.js';

export type ModelDuelCreateDependencies = {
  readonly createRun: CreateRunUseCase;
  readonly teams: Pick<UserModelTeamRepository, 'listTeams'>;
  readonly queue: Pick<RunQueueRepository, 'countActiveRuns' | 'readUserRunLimits'>;
  readonly runs: Pick<RunRepository, 'transitionRun'>;
  readonly now: () => number;
  readonly newDuelId: () => string;
};

export type ModelDuelCreateUseCase = (
  scope: OwnerScope,
  body: CreateModelDuelBody,
) => Promise<CreatedModelDuelView>;

type RunPlan = {
  readonly team: ModelTeamKey | null;
  readonly body: CreateRunBody;
};

// Todas as execuções do duelo largam na MESMA vela: o início é calculado uma vez, não por execução.
function resolveDuelStart(
  dependencies: ModelDuelCreateDependencies,
  body: CreateModelDuelBody,
): number {
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[body.setup.parameters.timeframe];
  return Math.floor(dependencies.now() / duration) * duration;
}

function baseBody(
  body: CreateModelDuelBody,
  common: { readonly periodStart: number; readonly duelGroupId: string },
): CreateRunBody {
  return {
    strategyVersionId: undefined,
    kind: RUN_KIND.LIVE_PAPER,
    setup: body.setup,
    periodStart: common.periodStart,
    periodEnd: undefined,
    walkForward: undefined,
    survival: undefined,
    goalId: undefined,
    analyst: undefined,
    signalSource: undefined,
    duelGroupId: common.duelGroupId,
  };
}

function planRuns(
  body: CreateModelDuelBody,
  common: { readonly periodStart: number; readonly duelGroupId: string },
): readonly RunPlan[] {
  const teamPlans = body.teams.map((team): RunPlan => ({
    team,
    body: {
      ...baseBody(body, common),
      signalSource: { kind: SIGNAL_SOURCE_KIND.MODEL_TEAM, team },
    },
  }));
  if (body.myStrategyVersionId === undefined) return teamPlans;
  const rules: RunPlan = {
    team: null,
    body: { ...baseBody(body, common), strategyVersionId: body.myStrategyVersionId },
  };
  return [...teamPlans, rules];
}

// Equipe desligada ou sem vaga para TODAS as execuções: nada é criado (409), nem uma.
async function assertDuelCanStart(
  dependencies: ModelDuelCreateDependencies,
  scope: OwnerScope,
  params: { readonly body: CreateModelDuelBody; readonly needed: number },
): Promise<void> {
  const [records, active, limits] = await Promise.all([
    dependencies.teams.listTeams(scope),
    dependencies.queue.countActiveRuns(scope, RUN_KIND.LIVE_PAPER),
    dependencies.queue.readUserRunLimits(scope),
  ]);
  const enabled = new Set(records.filter((row) => row.isEnabled).map((row) => row.teamKey));
  if (params.body.teams.some((team) => !enabled.has(team))) throw new ModelTeamDisabledError();
  if (active + params.needed > limits.maxActiveLivePaperRuns) throw new LiveRunLimitReachedError();
}

async function cancelCreated(
  dependencies: ModelDuelCreateDependencies,
  scope: OwnerScope,
  runIds: readonly string[],
): Promise<void> {
  await Promise.allSettled(
    runIds.map((runId) =>
      dependencies.runs.transitionRun(scope, { runId, to: RUN_STATUS.CANCELLED }),
    ),
  );
}

// Cria as execuções do duelo (RF13), cada uma pelo caminho normal de `POST /v1/runs` (admissão, interruptor, versão fixa). A
// conferência de vagas e do interruptor vem ANTES de criar a primeira; se uma criação falhar mesmo assim, as já criadas são
// canceladas e o erro segue, então o duelo nunca fica pela metade.
export function createModelDuelCreateUseCase(
  dependencies: ModelDuelCreateDependencies,
): ModelDuelCreateUseCase {
  return async (scope, body) => {
    const duelGroupId = dependencies.newDuelId();
    const plans = planRuns(body, {
      periodStart: resolveDuelStart(dependencies, body),
      duelGroupId,
    });
    await assertDuelCanStart(dependencies, scope, { body, needed: plans.length });
    const created: DuelRunView[] = [];
    try {
      for (const plan of plans) {
        const run = await dependencies.createRun(scope, plan.body);
        created.push({
          runId: run.id,
          team: plan.team,
          signalSource: run.signalSource,
          status: run.status,
          lastCandleTime: run.lastCandleTime,
          createdAt: run.createdAt,
        });
      }
    } catch (error: unknown) {
      await cancelCreated(
        dependencies,
        scope,
        created.map((item) => item.runId),
      );
      throw error;
    }
    return {
      duelId: duelGroupId,
      symbol: body.setup.parameters.symbol,
      timeframe: '15m',
      runs: created,
    };
  };
}
