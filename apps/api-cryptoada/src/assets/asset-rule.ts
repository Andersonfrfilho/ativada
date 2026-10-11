// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computeLatestTriggers,
  SIGNAL_ACTION,
  TRIGGER_STATE,
  type SignalAction,
  type StrategyVersion,
} from '@cryptoada/strategy-engine';

import { toSituationView, type GoalSituationView } from '../goals/goal-evaluation-view.js';
import type { SymbolSeries } from '../goals/goal-evaluation-series.js';
import {
  ASSET_RULE_ACTION,
  ASSET_RULE_CACHE_MAX_ENTRIES,
  type AssetRuleAction,
} from './asset.constant.js';

export type AssetRule = {
  readonly action: AssetRuleAction;
  // O sinal do último candle diário e o que falta para a regra votar VENDA (estado "comprado").
  readonly situation: GoalSituationView;
};

export type AssetRuleCacheKey = {
  readonly strategyVersionId: string;
  readonly symbol: string;
  readonly lastCandleOpenTime: number | null;
};

export type AssetRuleCache = {
  readonly get: (key: AssetRuleCacheKey) => AssetRule | null | undefined;
  readonly set: (key: AssetRuleCacheKey, rule: AssetRule | null) => void;
};

function keyText(key: AssetRuleCacheKey): string {
  return JSON.stringify([key.strategyVersionId, key.symbol, key.lastCandleOpenTime]);
}

// Memória da instância, limitada: a entrada mais velha sai primeiro; a regra do dia é determinística e barata de refazer.
export function createAssetRuleCache(
  maxEntries: number = ASSET_RULE_CACHE_MAX_ENTRIES,
): AssetRuleCache {
  const entries = new Map<string, AssetRule | null>();
  return {
    get: (key): AssetRule | null | undefined => entries.get(keyText(key)),
    set: (key, rule): void => {
      const text = keyText(key);
      entries.delete(text);
      entries.set(text, rule);
      if (entries.size <= maxEntries) return;
      const oldest = entries.keys().next();
      if (oldest.done !== true) entries.delete(oldest.value);
    },
  };
}

// A leitura do sinal para quem já tem a moeda: o placar mandando comprar a favor da posição é SEGURAR, mandando vender é
// VENDER, e sem sinal é AGUARDAR.
export function toRuleAction(action: SignalAction): AssetRuleAction {
  if (action === SIGNAL_ACTION.SELL) return ASSET_RULE_ACTION.SELL;
  return action === SIGNAL_ACTION.BUY ? ASSET_RULE_ACTION.HOLD : ASSET_RULE_ACTION.WAIT;
}

// A regra do dia de UM ativo (RF15): reaproveita o próximo gatilho do motor no estado "comprado". `null` se a série ainda
// não tem candles para o aquecimento da estratégia.
export function computeAssetRule(params: {
  readonly strategy: StrategyVersion;
  readonly series: SymbolSeries;
  readonly sentiments: Parameters<typeof computeLatestTriggers>[0]['sentiments'];
}): AssetRule | null {
  const latest = computeLatestTriggers({
    strategy: params.strategy,
    run: params.series.run,
    candles: params.series.candles,
    sentiments: params.sentiments,
    state: TRIGGER_STATE.HOLDING,
  });
  const situation = toSituationView(latest);
  if (latest === null || situation === null) return null;
  return { action: toRuleAction(latest.signal.action), situation };
}
