// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimal, formatPercent } from '../format/format.js';
import { METRIC_LABEL } from './goal.constant.js';
import type { RuleTrigger } from './goal.validation.js';

export type FamilyTrigger = { readonly family: string; readonly rule: RuleTrigger };

function distanceOf(rule: RuleTrigger): number {
  const distance = rule.distanceRate ?? rule.distance;
  return distance === null ? Number.POSITIVE_INFINITY : Math.abs(Number(distance));
}

// O próximo gatilho de uma família é a regra ainda não cumprida mais perto de votar; se todas já votaram, a primeira.
export function nextTriggerByFamily(rules: readonly RuleTrigger[]): FamilyTrigger[] {
  const families = [...new Set(rules.map((rule) => rule.family))];
  return families.flatMap((family) => {
    const own = rules.filter((rule) => rule.family === family);
    const pending = own.filter((rule) => !rule.isMet).sort((a, b) => distanceOf(a) - distanceOf(b));
    const rule = pending[0] ?? own[0];
    return rule === undefined ? [] : [{ family, rule }];
  });
}

export function describeTrigger(rule: RuleTrigger): string {
  const metric = METRIC_LABEL[rule.metric] ?? rule.metric;
  if (rule.isMet) return `${metric}: já cumprida`;
  if (rule.current === null || rule.threshold === null || rule.distance === null) {
    return `${metric}: sem leitura agora`;
  }
  const verb = rule.direction === 'below' ? 'precisa cair abaixo de' : 'precisa subir acima de';
  const rate = rule.distanceRate === null ? '' : ` (${formatPercent(Number(rule.distanceRate))})`;
  const basis = rule.basis === 'exact' ? 'exato' : 'indicativo';
  return `${metric} ${verb} ${formatDecimal(rule.threshold)}; agora ${formatDecimal(rule.current)}: faltam ${formatDecimal(rule.distance)}${rate} · ${basis}`;
}
