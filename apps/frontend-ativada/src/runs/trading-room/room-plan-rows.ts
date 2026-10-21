// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatSignedPercentDown, formatSignedScaled, parseScaled } from '../../format/decimal.js';
import { formatPrice } from '../../format/format.js';
import type { ProtectiveLevel, StrategyPlan, TeamPlan } from './trade-plan.validation.js';

export type RowTone = 'buy' | 'sell' | 'neutral' | 'up' | 'down';

export type OpinionRow = {
  readonly label: string;
  readonly value: string;
  readonly tone: RowTone;
  // A segunda linha da casa: o resultado em USDT fictício ou a distância.
  readonly detail?: string | undefined;
};

export const PLAN_ROW_LABEL = {
  BUY_AT: 'Comprar a',
  BOUGHT_AT: 'Comprou a',
  SELL_AT: 'Vender no alvo',
  PROFIT: 'Lucro previsto no alvo',
  NOW: 'Resultado agora',
  STOP: 'Proteção',
} as const;

const NO_VALUE = '—';
const FICTITIOUS = 'USDT fict.';

// A taxa do servidor (fração em texto) em porcentagem com sinal, arredondada para baixo: o ganho nunca sobra.
export function formatRate(rate: string): string {
  const scaled = parseScaled(rate);
  return scaled === undefined ? NO_VALUE : formatSignedPercentDown(scaled);
}

function formatNet(net: string): string {
  const scaled = parseScaled(net);
  return scaled === undefined ? NO_VALUE : `${formatSignedScaled(scaled)} ${FICTITIOUS}`;
}

function toneOf(rate: string): RowTone {
  return rate.startsWith('-') ? 'down' : 'up';
}

function resultRow(label: string, result: ProtectiveLevel['result']): OpinionRow[] {
  if (result === null) return [];
  return [
    {
      label,
      value: formatRate(result.rate),
      tone: toneOf(result.rate),
      detail: formatNet(result.net),
    },
  ];
}

function stopRow(stop: ProtectiveLevel): OpinionRow {
  const detail = stop.result === null ? undefined : formatRate(stop.result.rate);
  return { label: PLAN_ROW_LABEL.STOP, value: formatPrice(stop.price), tone: 'sell', detail };
}

type PlanLevels = {
  readonly entry: string;
  readonly entryLabel: string;
  readonly target: ProtectiveLevel;
  readonly stop: ProtectiveLevel;
};

function levelRows({ entry, entryLabel, target, stop }: PlanLevels): OpinionRow[] {
  return [
    { label: entryLabel, value: formatPrice(entry), tone: 'buy' },
    { label: PLAN_ROW_LABEL.SELL_AT, value: formatPrice(target.price), tone: 'sell' },
    ...resultRow(PLAN_ROW_LABEL.PROFIT, target.result),
    stopRow(stop),
  ];
}

// O plano da estratégia em casas prontas: comprar, alvo, lucro previsto (já sem o custo) e proteção; comprado, o
// resultado agora. Sem plano, nenhuma casa (a frase do servidor diz por quê).
export function strategyPlanRows(plan: StrategyPlan | undefined): readonly OpinionRow[] {
  if (plan === undefined || plan.status === 'unavailable') return [];
  if (plan.status === 'awaiting_entry') {
    return levelRows({ ...plan, entry: plan.entry.price, entryLabel: PLAN_ROW_LABEL.BUY_AT });
  }
  const rows = levelRows({ ...plan, entry: plan.entryPrice, entryLabel: PLAN_ROW_LABEL.BOUGHT_AT });
  return [...rows, ...resultRow(PLAN_ROW_LABEL.NOW, plan.exit.result)];
}

export function teamPlanRows(team: TeamPlan | undefined): readonly OpinionRow[] {
  if (team === undefined || team.status === 'unavailable') return [];
  return levelRows({ ...team, entry: team.entry.price, entryLabel: PLAN_ROW_LABEL.BUY_AT });
}

// A frase curta do plano da equipe que os agentes de regra repetem no balão (eles não têm alvo próprio).
export function describeStrategyPlan(plan: StrategyPlan | undefined): string | undefined {
  if (plan === undefined) return undefined;
  if (plan.status === 'unavailable') return plan.message;
  const profit =
    plan.target.result === null ? '' : ` · lucro previsto ${formatRate(plan.target.result.rate)}`;
  if (plan.status === 'holding') {
    return `Plano da equipe: comprado a ${formatPrice(plan.entryPrice)} · alvo ${formatPrice(plan.target.price)}${profit}`;
  }
  return `Plano da equipe: comprar a ${formatPrice(plan.entry.price)} · alvo ${formatPrice(plan.target.price)}${profit}`;
}
