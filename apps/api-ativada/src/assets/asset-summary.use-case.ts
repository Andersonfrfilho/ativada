// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  OwnerScope,
  StrategyRepository,
  UserAssetRecord,
  UserAssetRepository,
} from '@ativada/database';
import {
  computeHoldingLevels,
  createRunSetup,
  EngineDecimal,
  RULE_KIND,
  RUN_PARAMETERS_SCHEMA_VERSION,
  type RunParameters,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import { loadStrategy } from '../goals/goal-plan.use-case.js';
import type { GoalStrategyReader } from '../goals/goal-evaluation-strategies.js';
import type { GoalStrategyRef } from '../goals/goal-evaluation-view.js';
import { loadSymbolSeries, type SeriesReader } from '../goals/goal-evaluation-series.js';
import { DEFAULT_SENTIMENT_SOURCE } from '../runs/runs.constant.js';
import { loadCurrentPrice } from './asset-price.js';
import { computeAssetRule, type AssetRule, type AssetRuleCache } from './asset-rule.js';
import {
  buildSummaryItem,
  buildTotals,
  type AssetSummaryItem,
  type AssetSummaryTotals,
} from './asset-summary-item.js';
import type { AssetSummaryQuery } from './asset-requests.js';
import {
  ASSET_SUMMARY_CURRENCY,
  DEFAULT_ASSET_STOP_RATE,
  DEFAULT_ASSET_TARGET_RATE,
} from './asset.constant.js';

export type AssetSummaryDependencies = SeriesReader & {
  readonly assets: Pick<UserAssetRepository, 'listUserAssets'>;
  readonly strategies: GoalStrategyReader & Pick<StrategyRepository, 'findStrategy'>;
  readonly symbols: readonly string[];
  readonly now: () => number;
  readonly cache: AssetRuleCache;
};

export type AssetSummaryView = {
  readonly currency: string;
  readonly targetRate: string;
  readonly stopRate: string;
  readonly strategy: GoalStrategyRef | null;
  readonly items: readonly AssetSummaryItem[];
  readonly totals: AssetSummaryTotals;
};

export type GetAssetSummaryUseCase = (
  scope: OwnerScope,
  query: AssetSummaryQuery,
) => Promise<AssetSummaryView>;

// Os níveis de venda do ativo partem do preço médio e só cobram a saída: o tick fino evita arredondar moeda barata.
const HOLDING_PARAMETERS: RunParameters = createRunSetup({
  schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
  symbol: 'BTCUSDT',
  timeframe: '1d',
  sentimentSource: DEFAULT_SENTIMENT_SOURCE,
  tickSize: '0.00000001',
}).parameters;

type RuleContext = {
  readonly dependencies: AssetSummaryDependencies;
  readonly strategy:
    { readonly ref: GoalStrategyRef; readonly version: StrategyVersion } | undefined;
};

async function resolveRule(context: RuleContext, symbol: string): Promise<AssetRule | null> {
  const { dependencies, strategy } = context;
  if (strategy === undefined || !dependencies.symbols.includes(symbol)) return null;
  const series = await loadSymbolSeries(dependencies, { symbol, now: dependencies.now() });
  const key = {
    strategyVersionId: strategy.ref.versionId,
    symbol,
    lastCandleOpenTime: series.candles.at(-1)?.openTime ?? null,
  };
  const cached = dependencies.cache.get(key);
  if (cached !== undefined) return cached;
  const usesSentiment = strategy.version.config.rules.some(
    (rule) => rule.kind === RULE_KIND.FEAR_GREED,
  );
  const rule = computeAssetRule({
    strategy: strategy.version,
    series,
    sentiments: usesSentiment ? await series.loadSentiments() : undefined,
  });
  dependencies.cache.set(key, rule);
  return rule;
}

async function buildItem(
  context: RuleContext,
  params: {
    readonly asset: UserAssetRecord;
    readonly rates: { readonly targetRate: string; readonly stopRate: string };
  },
): Promise<AssetSummaryItem> {
  const { asset, rates } = params;
  const price = await loadCurrentPrice(context.dependencies, {
    symbol: asset.symbol,
    now: context.dependencies.now(),
  });
  return buildSummaryItem({
    asset,
    price,
    rule: await resolveRule(context, asset.symbol),
    levels: computeHoldingLevels({
      averagePrice: new EngineDecimal(asset.averagePrice),
      parameters: HOLDING_PARAMETERS,
      goal: { targetRate: rates.targetRate, maxLossRate: rates.stopRate, horizonDays: 1 },
    }),
  });
}

// O resumo de "Seus ativos" (RF15): para cada moeda com quantidade, o valor atual, o resultado sobre o custo, o alvo e o stop
// sobre o preço médio e, com uma estratégia escolhida, a regra do dia (segurar, vender ou aguardar).
export function createGetAssetSummaryUseCase(
  dependencies: AssetSummaryDependencies,
): GetAssetSummaryUseCase {
  return async (scope, query) => {
    const strategy =
      query.strategyId === undefined
        ? undefined
        : await loadStrategy(dependencies.strategies, { scope, strategyId: query.strategyId });
    const rates = {
      targetRate: query.targetRate ?? DEFAULT_ASSET_TARGET_RATE,
      stopRate: query.stopRate ?? DEFAULT_ASSET_STOP_RATE,
    };
    const held = (await dependencies.assets.listUserAssets(scope)).filter((asset) =>
      new EngineDecimal(asset.quantity).greaterThan(0),
    );
    const items: AssetSummaryItem[] = [];
    for (const asset of held)
      items.push(await buildItem({ dependencies, strategy }, { asset, rates }));
    return {
      currency: ASSET_SUMMARY_CURRENCY,
      ...rates,
      strategy: strategy?.ref ?? null,
      items,
      totals: buildTotals(items),
    };
  };
}
