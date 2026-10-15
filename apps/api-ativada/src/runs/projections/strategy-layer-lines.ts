// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '@ativada/database';
import {
  canonicalJson,
  formatEngineDecimal,
  RULE_KIND,
  ruleIndicatorId,
  toEngineDecimal,
  type StrategyRule,
} from '@ativada/strategy-engine';

import { formatPoints } from '../live-status/live-number-format.js';
import { LAYER_LINE_ROLE, type LayerLineRole } from './projections.constant.js';
import type { WindowConfig } from './threshold-segments.js';

// Uma linha sobre o preço (ADR 0002, spec 009, P2): a saída da regra que o motor gravou em `signals.indicators`.
export type LayerLineDefinition = {
  readonly key: string;
  readonly ruleId: string;
  readonly role: LayerLineRole;
  readonly label: string;
};

type LineSpec = {
  readonly output: string;
  readonly role: LayerLineRole;
  readonly label: string;
};

function describeDonchian(
  rule: Extract<StrategyRule, { kind: 'donchian_breakout' }>,
  isFixed: boolean,
): readonly LineSpec[] {
  const name = isFixed ? `Canal Donchian (${rule.period} velas)` : 'Canal Donchian';
  return [
    { output: 'upper', role: LAYER_LINE_ROLE.CHANNEL_UPPER, label: `${name}: topo` },
    { output: 'lower', role: LAYER_LINE_ROLE.CHANNEL_LOWER, label: `${name}: fundo` },
  ];
}

function describeEmaCross(
  rule: Extract<StrategyRule, { kind: 'ema_cross' }>,
  isFixed: boolean,
): readonly LineSpec[] {
  return [
    {
      output: 'fast',
      role: LAYER_LINE_ROLE.EMA_FAST,
      label: isFixed ? `Média rápida (EMA ${rule.fastPeriod})` : 'Média rápida (EMA)',
    },
    {
      output: 'slow',
      role: LAYER_LINE_ROLE.EMA_SLOW,
      label: isFixed ? `Média lenta (EMA ${rule.slowPeriod})` : 'Média lenta (EMA)',
    },
  ];
}

function describeBollinger(
  rule: Extract<StrategyRule, { kind: 'bollinger' }>,
  isFixed: boolean,
): readonly LineSpec[] {
  const name = isFixed
    ? `Bollinger (${rule.period} velas, ${formatPoints(rule.deviations)} desvios)`
    : 'Bollinger';
  return [
    { output: 'upper', role: LAYER_LINE_ROLE.BAND_UPPER, label: `${name}: banda de cima` },
    { output: 'middle', role: LAYER_LINE_ROLE.BAND_MIDDLE, label: `${name}: média` },
    { output: 'lower', role: LAYER_LINE_ROLE.BAND_LOWER, label: `${name}: banda de baixo` },
  ];
}

// MACD, RSI, OBV e Fear & Greed não desenham linha sobre o preço.
function describeRule(rule: StrategyRule, isFixed: boolean): readonly LineSpec[] {
  switch (rule.kind) {
    case RULE_KIND.DONCHIAN_BREAKOUT:
      return describeDonchian(rule, isFixed);
    case RULE_KIND.EMA_CROSS:
      return describeEmaCross(rule, isFixed);
    case RULE_KIND.BOLLINGER:
      return describeBollinger(rule, isFixed);
    default:
      return [];
  }
}

// No walk-forward o período da regra pode mudar de janela para janela: aí o rótulo perde os números (P2).
function isRuleFixed(rule: StrategyRule, windowConfigs: readonly WindowConfig[]): boolean {
  const original = canonicalJson(rule);
  return windowConfigs.every(({ config }) => {
    const used = config.rules.find((candidate) => candidate.id === rule.id);
    return used !== undefined && canonicalJson(used) === original;
  });
}

// Só as regras de PREÇO que a versão usa, na ordem das regras da configuração.
export function buildLineDefinitions(params: {
  readonly rules: readonly StrategyRule[];
  readonly windowConfigs: readonly WindowConfig[];
}): readonly LayerLineDefinition[] {
  return params.rules.flatMap((rule) =>
    describeRule(rule, isRuleFixed(rule, params.windowConfigs)).map((spec) => ({
      key: `${ruleIndicatorId(rule.id)}.${spec.output}`,
      ruleId: rule.id,
      role: spec.role,
      label: spec.label,
    })),
  );
}

// O `number` do indicador volta como texto decimal exato; chave ausente ou valor que não é número finito é `null`.
export function readIndicatorText(indicators: JsonContainer, key: string): string | null {
  if (Array.isArray(indicators)) return null;
  const value: unknown = Object.getOwnPropertyDescriptor(indicators, key)?.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return formatEngineDecimal(toEngineDecimal(String(value)));
}
