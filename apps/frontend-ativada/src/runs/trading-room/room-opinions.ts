// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconyAgent } from '../team-room/balcony/balcony-agents.js';
import { BALCONY_SLOT, type BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { SeatLook } from '../team-room/team-room.types.js';
import {
  describeStrategyPlan,
  formatRate,
  PLAN_ROW_LABEL,
  strategyPlanRows,
  teamPlanRows,
  type OpinionRow,
} from './room-plan-rows.js';
import type { TeamPlan, TradePlan } from './trade-plan.validation.js';

export type OpinionKind = 'rule' | 'leader' | 'auditor' | 'model';

export type RoomOpinion = {
  readonly slot: BalconySlot;
  readonly name: string;
  readonly role: string;
  readonly kind: OpinionKind;
  // Estado sempre em ícone + palavra + cor; sem leitura, o selo neutro.
  readonly intent: SeatLook;
  readonly isOut: boolean;
  // O que ele lê (frase ou leitura gravada pelo servidor).
  readonly line: string | undefined;
  readonly rows: readonly OpinionRow[];
  // O plano da equipe que o agente de regra repete, ou a frase do servidor quando não há números.
  readonly note: string | undefined;
  readonly confidence: number | null;
  readonly wallet: string | undefined;
};

export type RoomOpinionsInput = {
  readonly agents: readonly BalconyAgent[];
  readonly models: readonly BalconyAgent[];
  readonly tradePlan: TradePlan | undefined;
};

export const OUT_OF_SCORE = 'fora do placar';
const NO_READING: SeatLook = { tone: 'neutral', icon: 'info', word: 'sem leitura' };

function kindOf(agent: BalconyAgent): OpinionKind {
  if (agent.kind === 'model') return 'model';
  if (agent.slot === BALCONY_SLOT.ALICE) return 'leader';
  return agent.slot === BALCONY_SLOT.OTAVIO ? 'auditor' : 'rule';
}

function baseOf(agent: BalconyAgent): Omit<RoomOpinion, 'rows' | 'note'> {
  return {
    slot: agent.slot,
    name: agent.name,
    role: agent.roleShort,
    kind: kindOf(agent),
    intent: agent.vote ?? NO_READING,
    isOut: agent.kind === 'rule' && agent.tone === 'quiet',
    line: agent.line,
    confidence: null,
    wallet: undefined,
  };
}

function walletOf(team: TeamPlan): string | undefined {
  if (team.wallet === null) return undefined;
  return `Carteira dela: ${formatRate(team.wallet.resultRate)}`;
}

function modelOpinion(agent: BalconyAgent, plan: TradePlan | undefined): RoomOpinion {
  const team = plan?.teams.find((item) => item.teamKey === agent.teamKey);
  return {
    ...baseOf(agent),
    rows: teamPlanRows(team),
    note: team === undefined || team.status === 'available' ? undefined : team.message,
    confidence: team?.confidence ?? null,
    wallet: team === undefined ? undefined : walletOf(team),
  };
}

function ruleOpinion(agent: BalconyAgent, plan: TradePlan | undefined): RoomOpinion {
  const base = baseOf(agent);
  if (base.kind === 'leader') {
    const isUnavailable = plan?.plan.status === 'unavailable';
    return {
      ...base,
      rows: strategyPlanRows(plan?.plan),
      note: isUnavailable ? plan?.plan.message : undefined,
    };
  }
  if (base.kind === 'auditor') return { ...base, rows: [], note: undefined };
  return { ...base, rows: [], note: describeStrategyPlan(plan?.plan) };
}

// Quem está na sala e o que cada um acha: os seis de regra e só as equipes ◆ ligadas (o chamador já as filtra). Os números
// são os do servidor; os agentes de regra não têm alvo próprio, então repetem o plano da equipe.
export function buildRoomOpinions({
  agents,
  models,
  tradePlan,
}: RoomOpinionsInput): readonly RoomOpinion[] {
  return [
    ...agents.map((agent) => ruleOpinion(agent, tradePlan)),
    ...models.map((agent) => modelOpinion(agent, tradePlan)),
  ];
}

// As duas linhas da plaquinha da mesa.
export function summarize(opinion: RoomOpinion): readonly [string, string] {
  const [first, second] = opinion.rows;
  const stop = opinion.rows.find((row) => row.label === PLAN_ROW_LABEL.STOP);
  if (first !== undefined && second !== undefined) {
    return [`${first.value} → ${second.value}`, stop === undefined ? '' : `prot. ${stop.value}`];
  }
  const head = opinion.line ?? opinion.note ?? '';
  return [head, opinion.isOut ? OUT_OF_SCORE : (opinion.note ?? '')];
}
