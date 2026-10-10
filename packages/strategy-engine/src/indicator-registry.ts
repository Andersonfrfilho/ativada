// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ADX_INDICATOR } from './adx.indicator.js';
import { ATR_INDICATOR } from './atr.indicator.js';
import { BOLLINGER_INDICATOR } from './bollinger.indicator.js';
import { DONCHIAN_INDICATOR } from './donchian.indicator.js';
import { EMA_CROSS_INDICATOR } from './ema-cross.indicator.js';
import { RULE_KIND, REGIME_FILTER_KIND } from './engine-vocabulary.constant.js';
import { INDICATOR_NAME, type IndicatorName } from './indicator-name.constant.js';
import type { Indicator, IndicatorValue } from './indicator.types.js';
import type { JsonValue } from './json-value.types.js';
import { MACD_INDICATOR } from './macd.indicator.js';
import { OBV_TREND_INDICATOR } from './obv-trend.indicator.js';
import { RSI_INDICATOR } from './rsi.indicator.js';
import type { RegimeConfig, RiskConfig, StrategyRule } from './strategy-config.types.js';

export type CandleRule = Exclude<StrategyRule, { readonly kind: typeof RULE_KIND.FEAR_GREED }>;
export type CandleRuleKind = CandleRule['kind'];
export type AdxRegimeConfig = Extract<
  RegimeConfig,
  { readonly kind: typeof REGIME_FILTER_KIND.ADX }
>;
type RuleOf<TKind extends CandleRuleKind> = Extract<CandleRule, { readonly kind: TKind }>;

// Como o motor (T2.3) cria e retoma o indicador de cada regra, do risco e do regime a partir da
// configuração: o `snapshot` guardado no estado volta pelo mesmo caminho.
export type IndicatorBinding<TConfig> = {
  readonly name: IndicatorName;
  readonly create: (config: TConfig) => Indicator<IndicatorValue>;
  readonly restore: (params: {
    readonly config: TConfig;
    readonly snapshot: JsonValue;
  }) => Indicator<IndicatorValue>;
};

export type IndicatorRegistry = {
  readonly rules: { readonly [TKind in CandleRuleKind]: IndicatorBinding<RuleOf<TKind>> };
  readonly risk: IndicatorBinding<RiskConfig>;
  readonly regime: IndicatorBinding<AdxRegimeConfig>;
};

export const INDICATOR_REGISTRY: IndicatorRegistry = {
  rules: {
    [RULE_KIND.EMA_CROSS]: {
      name: INDICATOR_NAME.EMA_CROSS,
      create: (rule) => EMA_CROSS_INDICATOR.create(rule),
      restore: ({ config, snapshot }) => EMA_CROSS_INDICATOR.restore({ params: config, snapshot }),
    },
    [RULE_KIND.MACD]: {
      name: INDICATOR_NAME.MACD,
      create: (rule) => MACD_INDICATOR.create(rule),
      restore: ({ config, snapshot }) => MACD_INDICATOR.restore({ params: config, snapshot }),
    },
    [RULE_KIND.DONCHIAN_BREAKOUT]: {
      name: INDICATOR_NAME.DONCHIAN,
      create: (rule) => DONCHIAN_INDICATOR.create(rule),
      restore: ({ config, snapshot }) => DONCHIAN_INDICATOR.restore({ params: config, snapshot }),
    },
    [RULE_KIND.RSI]: {
      name: INDICATOR_NAME.RSI,
      create: (rule) => RSI_INDICATOR.create(rule),
      restore: ({ config, snapshot }) => RSI_INDICATOR.restore({ params: config, snapshot }),
    },
    // O desvio vem como texto decimal de uma casa ("2.3"); `Number` lê exatamente o que ele escreve.
    [RULE_KIND.BOLLINGER]: {
      name: INDICATOR_NAME.BOLLINGER,
      create: (rule) =>
        BOLLINGER_INDICATOR.create({ period: rule.period, deviations: Number(rule.deviations) }),
      restore: ({ config, snapshot }) =>
        BOLLINGER_INDICATOR.restore({
          params: { period: config.period, deviations: Number(config.deviations) },
          snapshot,
        }),
    },
    [RULE_KIND.OBV_TREND]: {
      name: INDICATOR_NAME.OBV_TREND,
      create: (rule) => OBV_TREND_INDICATOR.create(rule),
      restore: ({ config, snapshot }) => OBV_TREND_INDICATOR.restore({ params: config, snapshot }),
    },
  },
  risk: {
    name: INDICATOR_NAME.ATR,
    create: (risk) => ATR_INDICATOR.create({ period: risk.atrPeriod }),
    restore: ({ config, snapshot }) =>
      ATR_INDICATOR.restore({ params: { period: config.atrPeriod }, snapshot }),
  },
  regime: {
    name: INDICATOR_NAME.ADX,
    create: (regime) => ADX_INDICATOR.create({ period: regime.period }),
    restore: ({ config, snapshot }) =>
      ADX_INDICATOR.restore({ params: { period: config.period }, snapshot }),
  },
};

// Fear & Greed lê o sentimento, não candles: não tem indicador.
export function isCandleRule(rule: StrategyRule): rule is CandleRule {
  return rule.kind !== RULE_KIND.FEAR_GREED;
}

export function createRuleIndicator(rule: CandleRule): Indicator<IndicatorValue> {
  switch (rule.kind) {
    case RULE_KIND.EMA_CROSS:
      return INDICATOR_REGISTRY.rules[RULE_KIND.EMA_CROSS].create(rule);
    case RULE_KIND.MACD:
      return INDICATOR_REGISTRY.rules[RULE_KIND.MACD].create(rule);
    case RULE_KIND.DONCHIAN_BREAKOUT:
      return INDICATOR_REGISTRY.rules[RULE_KIND.DONCHIAN_BREAKOUT].create(rule);
    case RULE_KIND.RSI:
      return INDICATOR_REGISTRY.rules[RULE_KIND.RSI].create(rule);
    case RULE_KIND.BOLLINGER:
      return INDICATOR_REGISTRY.rules[RULE_KIND.BOLLINGER].create(rule);
    case RULE_KIND.OBV_TREND:
      return INDICATOR_REGISTRY.rules[RULE_KIND.OBV_TREND].create(rule);
  }
}

export type RestoreRuleIndicatorParams = {
  readonly rule: CandleRule;
  readonly snapshot: JsonValue;
};

export function restoreRuleIndicator(
  params: RestoreRuleIndicatorParams,
): Indicator<IndicatorValue> {
  const { rule, snapshot } = params;
  switch (rule.kind) {
    case RULE_KIND.EMA_CROSS:
      return INDICATOR_REGISTRY.rules[RULE_KIND.EMA_CROSS].restore({ config: rule, snapshot });
    case RULE_KIND.MACD:
      return INDICATOR_REGISTRY.rules[RULE_KIND.MACD].restore({ config: rule, snapshot });
    case RULE_KIND.DONCHIAN_BREAKOUT:
      return INDICATOR_REGISTRY.rules[RULE_KIND.DONCHIAN_BREAKOUT].restore({
        config: rule,
        snapshot,
      });
    case RULE_KIND.RSI:
      return INDICATOR_REGISTRY.rules[RULE_KIND.RSI].restore({ config: rule, snapshot });
    case RULE_KIND.BOLLINGER:
      return INDICATOR_REGISTRY.rules[RULE_KIND.BOLLINGER].restore({ config: rule, snapshot });
    case RULE_KIND.OBV_TREND:
      return INDICATOR_REGISTRY.rules[RULE_KIND.OBV_TREND].restore({ config: rule, snapshot });
  }
}
