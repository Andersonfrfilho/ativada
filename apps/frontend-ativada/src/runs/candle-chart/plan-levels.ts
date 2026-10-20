// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPrice } from '../../format/format.js';
import type { StrategyPlan } from '../trading-room/trade-plan.validation.js';
import { toDrawingNumber } from './candle-series.js';
import type { SurfacePriceLevel } from './chart-surface.types.js';

export const PLAN_LEVEL_LABEL = {
  ENTRY: 'Compra simulada',
  HELD: 'Entrada',
  TARGET: 'Alvo',
  STOP: 'Proteção',
} as const;

function levelOf(role: SurfacePriceLevel['role'], text: string, label: string): SurfacePriceLevel {
  return { key: role, role, price: toDrawingNumber(text), title: `${label} ${formatPrice(text)}` };
}

// As linhas do telão saem do plano do servidor (`trade-plan`): a compra simulada (ou a entrada já feita), o alvo e a
// proteção, cada uma com o preço na etiqueta do eixo. Sem plano (`unavailable`), `undefined`: vale o nível antigo.
export function buildPlanLevels(plan: StrategyPlan | undefined): SurfacePriceLevel[] | undefined {
  if (plan === undefined || plan.status === 'unavailable') return undefined;
  const entry =
    plan.status === 'awaiting_entry'
      ? levelOf('entry', plan.entry.price, PLAN_LEVEL_LABEL.ENTRY)
      : levelOf('entry', plan.entryPrice, PLAN_LEVEL_LABEL.HELD);
  return [
    entry,
    levelOf('target', plan.target.price, PLAN_LEVEL_LABEL.TARGET),
    levelOf('stop', plan.stop.price, PLAN_LEVEL_LABEL.STOP),
  ];
}
