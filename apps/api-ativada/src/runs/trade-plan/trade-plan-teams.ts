// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MODEL_TEAM_REPORT_KIND,
  MODEL_TEAM_REPORT_STATUS,
  type TeamReportRow,
} from '@ativada/database';
import { MODEL_TEAMS, type ModelTeamKey } from '@ativada/model-agents';
import {
  formatEngineDecimal,
  ROUNDING_DIRECTION,
  SIZING_CONSTRAINT,
  toEngineDecimal,
} from '@ativada/strategy-engine';

import { describeTeamAvailable, describeTeamUnavailable } from './trade-plan-messages.js';
import {
  distanceFromCurrent,
  sizeEntry,
  stopView,
  targetView,
  type PlanBasis,
} from './trade-plan-levels.js';
import { marketBuyFill, tickDown, tickUp } from './trade-plan-math.js';
import type {
  AvailableTeamPlanView,
  TeamPlanView,
  TeamWalletView,
  UnavailableTeamPlanView,
} from './trade-plan-view.js';
import {
  TEAM_PLAN_STATUS,
  TEAM_PLAN_UNAVAILABLE_REASON,
  type TeamPlanUnavailableReason,
} from './trade-plan.constant.js';

export type TeamPlanParams = {
  readonly teamKey: ModelTeamKey;
  readonly basis: PlanBasis;
  readonly reports: readonly TeamReportRow[];
  readonly wallet: TeamWalletView | null;
};

type DecidedReport = TeamReportRow & {
  readonly entryPrice: string;
  readonly targetPrice: string;
  readonly stopPrice: string;
};

type TeamAction = UnavailableTeamPlanView['action'];

function toTeamAction(action: string | null | undefined): TeamAction {
  return action === 'buy' || action === 'sell' || action === 'hold' ? action : null;
}

// A recomendação AGENDADA decidida mais nova da equipe no par (pedido avulso não entra: não é o que a equipe decidiu na vela).
function latestDecided(params: TeamPlanParams): TeamReportRow | undefined {
  return params.reports
    .filter(
      (row) =>
        row.teamKey === params.teamKey &&
        row.kind === MODEL_TEAM_REPORT_KIND.SCHEDULED &&
        row.status === MODEL_TEAM_REPORT_STATUS.DECIDED,
    )
    .reduce<TeamReportRow | undefined>(
      (newest, row) => (newest === undefined || row.candleTime > newest.candleTime ? row : newest),
      undefined,
    );
}

function isBuyWithLevels(row: TeamReportRow): row is DecidedReport {
  return (
    row.action === 'buy' &&
    row.entryPrice !== null &&
    row.targetPrice !== null &&
    row.stopPrice !== null
  );
}

function unavailableTeam(
  params: TeamPlanParams,
  reason: TeamPlanUnavailableReason,
  row: TeamReportRow | undefined,
): UnavailableTeamPlanView {
  const displayName = MODEL_TEAMS[params.teamKey].displayName;
  return {
    status: TEAM_PLAN_STATUS.UNAVAILABLE,
    teamKey: params.teamKey,
    displayName,
    wallet: params.wallet,
    reason,
    reportId: row?.id ?? null,
    candleTime: row?.candleTime ?? null,
    action: toTeamAction(row?.action),
    confidence: row?.confidence ?? null,
    message: describeTeamUnavailable(displayName, reason),
  };
}

// Os preços da equipe na grade do par, contra o usuário: a entrada e o alvo para cima, a proteção para baixo; a compra
// simulada sai da entrada sugerida como se ela fosse a abertura (mais deslizamento, tick para cima).
function availableTeam(params: TeamPlanParams, row: DecidedReport): TeamPlanView {
  const { basis } = params;
  const pricing = basis.parameters;
  const fill = marketBuyFill(tickUp(toEngineDecimal(row.entryPrice), pricing), pricing);
  const target = tickUp(toEngineDecimal(row.targetPrice), pricing);
  const stop = tickDown(toEngineDecimal(row.stopPrice), pricing);
  if (!stop.isPositive() || !target.greaterThan(fill)) {
    return unavailableTeam(params, TEAM_PLAN_UNAVAILABLE_REASON.INVALID_LEVELS, row);
  }
  const { sizing, levels } = sizeEntry(basis, { entryPrice: fill, stop });
  if (sizing.constraint === SIZING_CONSTRAINT.INVALID_STOP) {
    return unavailableTeam(params, TEAM_PLAN_UNAVAILABLE_REASON.INVALID_LEVELS, row);
  }
  const view: Omit<AvailableTeamPlanView, 'message'> = {
    status: TEAM_PLAN_STATUS.AVAILABLE,
    teamKey: params.teamKey,
    displayName: MODEL_TEAMS[params.teamKey].displayName,
    wallet: params.wallet,
    reportId: row.id,
    candleTime: row.candleTime,
    confidence: row.confidence,
    entry: {
      suggestedPrice: row.entryPrice,
      price: formatEngineDecimal(fill),
      distance: distanceFromCurrent(basis, fill, ROUNDING_DIRECTION.UP),
    },
    target: targetView(levels, target),
    stop: stopView(levels, stop),
    sizing,
  };
  return { ...view, message: describeTeamAvailable(view) };
}

export function buildTeamPlan(params: TeamPlanParams): TeamPlanView {
  const row = latestDecided(params);
  if (row === undefined) {
    return unavailableTeam(params, TEAM_PLAN_UNAVAILABLE_REASON.NO_REPORT, undefined);
  }
  if (!isBuyWithLevels(row))
    return unavailableTeam(params, TEAM_PLAN_UNAVAILABLE_REASON.NO_ENTRY, row);
  return availableTeam(params, row);
}
