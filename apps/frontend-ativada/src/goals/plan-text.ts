// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatChangePercent, formatPrice, formatPercent } from '../format/format.js';
import type { PlanLevel, PlanView } from './plan.validation.js';

export const BASIS_TEXT = {
  exact: 'Exato: o preço depende só do fechamento da próxima vela.',
  indicative:
    'Indicativo: depende também do volume ou da amplitude da próxima vela, que ainda não existem.',
} as const;

export function describeBuy(level: PlanLevel, entryReference: string | null): string {
  if (level.status === 'unreachable') return 'inalcançável com os dados de hoje';
  if (level.status === 'already_active' || level.price === null) {
    const reference = entryReference === null ? '' : `; referência ${formatPrice(entryReference)}`;
    return `sinal de compra já ativo${reference}`;
  }
  const side = level.trigger === 'at_or_above' ? 'ou acima' : 'ou abaixo';
  const gap =
    level.distanceRate === null
      ? ''
      : ` (${formatPercent(Number(level.distanceRate))} do fechamento)`;
  return `${formatPrice(level.price)}: fechar nesse preço ${side}${gap}`;
}

// Quanto falta, no preço de agora, até o nível: "+2,65%" sobe, "−0,34%" cai.
export function describeDistance(level: string, current: string): string {
  return `${formatChangePercent(Number(level) / Number(current) - 1)} do preço agora`;
}

export function describeTarget(target: PlanView['plan']['target']): string {
  return target === null ? 'sem alvo' : `+${formatPercent(Number(target.rate))} sobre a entrada`;
}

export function describeStop(stop: PlanView['plan']['stop']): string {
  return stop === null
    ? 'sem stop'
    : `${formatPercent(Math.abs(Number(stop.rate)))} de perda máxima`;
}
