// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { useModelTeamsView } from '../model-teams/useModelTeamsView.hook.js';
import { buildBalconyAgents } from '../team-room/balcony/balcony-agents.js';
import { buildModelAgent } from '../team-room/balcony/model-agents.js';
import { useCompactTeamModel } from '../team-room/useCompactTeamModel.hook.js';
import type { LifeLine } from './office-life.types.js';
import { buildRoomOpinions, type RoomOpinion } from './room-opinions.js';
import { useTradePlanQuery } from './trade-plan.query.js';
import type { TradePlan } from './trade-plan.validation.js';

export type TradingRoomModel = {
  readonly tradePlan: TradePlan | undefined;
  readonly opinions: readonly RoomOpinion[];
  readonly lines: Readonly<Record<string, LifeLine>>;
  // A vela da decisão mais nova: muda quando a equipe decide de novo.
  readonly decisionKey: number | undefined;
  // Execução de equipe ◆: o placar das regras não se aplica, então os agentes de regra não aparecem.
  readonly isTeamRun: boolean;
};

function linesOf(opinions: readonly RoomOpinion[]): Readonly<Record<string, LifeLine>> {
  return Object.fromEntries(
    opinions.map((opinion) => {
      const said = opinion.line ?? opinion.note;
      const line = said === undefined ? opinion.intent.word : `${opinion.intent.word}: ${said}`;
      return [opinion.slot, { name: opinion.name, line }];
    }),
  );
}

// Tudo o que a sala mostra, das consultas que o painel já tem (acompanhamento, decisões, equipes ◆) mais o plano do
// servidor. Só as equipes ◆ ligadas entram (`useModelTeamsView` já filtra).
export function useTradingRoomModel(runId: string, status: LiveStatus): TradingRoomModel {
  const tradePlan = useTradePlanQuery(runId, true).data;
  const team = useCompactTeamModel({ runId, status, isAnimationOn: false });
  const models = useModelTeamsView();
  const { triggers } = status;
  const isTeamRun = triggers.status === 'unavailable' && triggers.reason === 'team_run';
  const view = isTeamRun ? undefined : team?.view;
  const agents =
    view === undefined
      ? []
      : buildBalconyAgents({ view, auditor: team?.auditor, horizon: undefined });
  const modelAgents = models.teams.map((card) => buildModelAgent(card, models.status));
  const opinions = buildRoomOpinions({ agents, models: modelAgents, tradePlan });
  return {
    tradePlan,
    opinions,
    lines: linesOf(opinions),
    decisionKey: status.decisions.items[0]?.candleTime,
    isTeamRun,
  };
}
