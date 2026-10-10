// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RULE_KIND, type RuleKind } from '../engine-vocabulary.constant.js';

// O catálogo FECHADO do que a grade pode ajustar (ADR 0002, "Walk-forward"): cada caminho é um campo
// numérico da configuração da estratégia. Nada de caminho arbitrário: id, tipo da regra, pesos do regime,
// tipo da ordem e versão do esquema não são ajustáveis.
export const TUNABLE_STATIC_PATHS = [
  'thresholds.buy',
  'thresholds.sell',
  'risk.atrPeriod',
  'risk.stopAtrMultiple',
  'risk.targetAtrMultiple',
  'risk.riskPerTrade',
  'risk.maxExposureRate',
  'regime.period',
  'regime.trendThreshold',
  'entry.offsetRate',
  'entry.expiryCandles',
] as const;

export const TUNABLE_RULE_FIELDS: Readonly<Record<RuleKind, readonly string[]>> = {
  [RULE_KIND.EMA_CROSS]: ['fastPeriod', 'slowPeriod'],
  [RULE_KIND.MACD]: ['fastPeriod', 'slowPeriod', 'signalPeriod'],
  [RULE_KIND.DONCHIAN_BREAKOUT]: ['period'],
  [RULE_KIND.RSI]: ['period', 'oversold', 'overbought'],
  [RULE_KIND.BOLLINGER]: ['period', 'deviations'],
  [RULE_KIND.OBV_TREND]: ['emaPeriod'],
  [RULE_KIND.FEAR_GREED]: ['fearAtOrBelow', 'greedAtOrAbove'],
};

export const RULE_PATH_PREFIX = 'rules';
const PATH_SEPARATOR = '.';
const RULE_PATH_SEGMENTS = 3;
const RULE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ALL_RULE_FIELDS: readonly string[] = [...new Set(Object.values(TUNABLE_RULE_FIELDS).flat())];
const STATIC_PATHS: readonly string[] = TUNABLE_STATIC_PATHS;

export type ParsedTunablePath =
  | { readonly kind: 'static'; readonly section: string; readonly field: string }
  | { readonly kind: 'rule'; readonly ruleId: string; readonly field: string };

// Só a SINTAXE do catálogo: se o caminho existe na configuração-base é conferido na expansão da grade.
export function parseTunablePath(path: string): ParsedTunablePath | undefined {
  if (STATIC_PATHS.includes(path)) {
    const [section = '', field = ''] = path.split(PATH_SEPARATOR);
    return { kind: 'static', section, field };
  }
  const segments = path.split(PATH_SEPARATOR);
  const [prefix, ruleId, field] = segments;
  if (segments.length !== RULE_PATH_SEGMENTS || prefix !== RULE_PATH_PREFIX) return undefined;
  if (ruleId === undefined || field === undefined) return undefined;
  if (!RULE_ID_PATTERN.test(ruleId) || !ALL_RULE_FIELDS.includes(field)) return undefined;
  return { kind: 'rule', ruleId, field };
}
