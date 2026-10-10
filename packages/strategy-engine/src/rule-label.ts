// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RULE_KIND } from './engine-vocabulary.constant.js';
import type { StrategyRule } from './strategy-config.types.js';

const FEAR_GREED_LABEL = 'Fear & Greed';

// Rótulo do motivo: a grafia é parte do contrato (ADR 0002 §f) e não depende de locale.
export function ruleLabel(rule: StrategyRule): string {
  switch (rule.kind) {
    case RULE_KIND.EMA_CROSS:
      return `EMA ${rule.fastPeriod}×${rule.slowPeriod}`;
    case RULE_KIND.MACD:
      return `MACD ${rule.fastPeriod}/${rule.slowPeriod}/${rule.signalPeriod}`;
    case RULE_KIND.DONCHIAN_BREAKOUT:
      return `Donchian ${rule.period}`;
    case RULE_KIND.RSI:
      return `RSI ${rule.period}`;
    case RULE_KIND.BOLLINGER:
      return `Bollinger ${rule.period}/${rule.deviations}`;
    case RULE_KIND.OBV_TREND:
      return `OBV×EMA ${rule.emaPeriod}`;
    case RULE_KIND.FEAR_GREED:
      return FEAR_GREED_LABEL;
  }
}
