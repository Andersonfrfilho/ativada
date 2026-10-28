// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_STATUS,
  type DecisionRow,
  type ModelTeamReadRepository,
  type OwnerScope,
  type PositionInput,
  type RunLiveStatusRepository,
  type RunRecord,
  type UserModelTeamRepository,
} from '@ativada/database';
import { readSignalSource } from '@ativada/model-agents';
import { toEngineDecimal } from '@ativada/strategy-engine';

import {
  findLiveRun,
  readLiveContext,
  toDecisionMarket,
  type LiveRunContext,
  type LiveStatusRunDependencies,
} from '../live-status/live-status-context.js';
import { TRADE_PLAN_NOTICE } from './trade-plan-messages.js';
import { buildAwaitingPlan, buildHoldingPlan, unavailablePlan } from './trade-plan-run.js';
import { buildPlanTeams } from './trade-plan-team-list.js';
import type { RunTradePlanView, TradePlanView } from './trade-plan-view.js';
import {
  TRADE_PLAN_UNAVAILABLE_REASON,
  TRADE_PLAN_VERSION,
  type TradePlanUnavailableReason,
} from './trade-plan.constant.js';

export type TradePlanDependencies = LiveStatusRunDependencies & {
  readonly live: Pick<
    RunLiveStatusRepository,
    'readLatestEquityPoint' | 'listDecisionRows' | 'listPositionsAround'
  >;
  readonly teams: Pick<UserModelTeamRepository, 'listTeams'>;
  readonly reports: Pick<ModelTeamReadRepository, 'readOverview'>;
};

// `buyAt`: a pergunta "E se eu comprar a X?" troca a entrada estimada pelo preço pedido, com ou sem posição aberta.
export type TradePlanOptions = { readonly buyAt?: string | undefined };

export type TradePlanUseCase = (
  scope: OwnerScope,
  runId: string,
  options?: TradePlanOptions,
) => Promise<TradePlanView>;

// Simulação que não anda não tem próxima compra nem venda a estimar: o motivo vem antes de qualquer número.
function readHaltReason(run: RunRecord): TradePlanUnavailableReason | undefined {
  if (run.status !== RUN_STATUS.RUNNING) return TRADE_PLAN_UNAVAILABLE_REASON.NOT_RUNNING;
  if (run.stalledSince !== undefined) return TRADE_PLAN_UNAVAILABLE_REASON.STALLED;
  if (run.waitingSince !== undefined) return TRADE_PLAN_UNAVAILABLE_REASON.WAITING_FOR_DATA;
  return undefined;
}

function toView(
  run: RunRecord,
  plan: RunTradePlanView,
  teams: TradePlanView['teams'],
): TradePlanView {
  return {
    version: TRADE_PLAN_VERSION,
    runId: run.id,
    symbol: run.symbol,
    timeframe: run.timeframe,
    notice: TRADE_PLAN_NOTICE,
    plan,
    teams,
  };
}

type PlanInputs = {
  readonly context: LiveRunContext;
  readonly row: DecisionRow | undefined;
  readonly position: PositionInput | undefined;
  readonly latestEquity: string | undefined;
  readonly enabled: readonly string[];
};

// Cinco leituras juntas DEPOIS da execução do dono: a versão, a última decisão com a vela, a posição aberta, o último ponto e o
// interruptor das equipes.
async function readPlanInputs(
  dependencies: TradePlanDependencies,
  scope: OwnerScope,
  run: RunRecord,
): Promise<PlanInputs> {
  const [context, page, positions, equityPoint, records] = await Promise.all([
    readLiveContext(dependencies, { scope, run }),
    dependencies.live.listDecisionRows(scope, run.id, {
      market: toDecisionMarket(dependencies, run),
      before: undefined,
      limit: 1,
    }),
    dependencies.live.listPositionsAround(scope, run.id, { span: undefined, limit: 1 }),
    dependencies.live.readLatestEquityPoint(scope, run.id),
    dependencies.teams.listTeams(scope),
  ]);
  return {
    context,
    row: page.items[0],
    position: positions[0],
    latestEquity: equityPoint?.equity,
    enabled: records.filter((record) => record.isEnabled).map((record) => record.teamKey),
  };
}

// O plano de operação da simulação ao vivo (ADR 0002 "Plano de operação ao vivo"): no máximo 7 consultas por chave e com LIMIT
// (execução, versão, última decisão com a vela, posição aberta, último ponto, interruptor das equipes e as recomendações do par),
// sem reexecutar o motor: só as funções puras de preenchimento e dimensionamento sobre o que está gravado.
export function createTradePlanUseCase(dependencies: TradePlanDependencies): TradePlanUseCase {
  return async (scope, runId, options = {}) => {
    const run = await findLiveRun(dependencies, { scope, runId });
    const halt = readHaltReason(run);
    if (halt !== undefined) return toView(run, unavailablePlan(halt), []);
    const inputs = await readPlanInputs(dependencies, scope, run);
    const { row, position, context } = inputs;
    if (row === undefined) {
      return toView(run, unavailablePlan(TRADE_PLAN_UNAVAILABLE_REASON.NO_CANDLE), []);
    }
    const basis = {
      config: context.config,
      parameters: context.parameters,
      // Sem posição o patrimônio é o caixa; comprada, é a base que uma entrada da equipe usaria.
      cash: inputs.latestEquity ?? context.parameters.initialBalance,
      currentPrice: toEngineDecimal(row.close),
      decisionVolume: row.volume,
    };
    const candle = { basis, row, durationMilliseconds: context.durationMilliseconds };
    const plan =
      position === undefined || options.buyAt !== undefined
        ? buildAwaitingPlan({ ...candle, buyAt: options.buyAt })
        : buildHoldingPlan({ ...candle, position });
    const teams = await buildPlanTeams({
      reports: dependencies.reports,
      exchange: dependencies.exchange,
      run,
      basis,
      enabled: inputs.enabled,
      latestEquity: inputs.latestEquity,
      signalTeam: readSignalSource(run.request)?.team,
    });
    return toView(run, plan, teams);
  };
}
