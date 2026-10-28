// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope, RunLiveStatusRepository } from '@ativada/database';

import { LIVE_DECISIONS_PAGE_SIZE } from '../runs.constant.js';
import { toDecisionsPageView, toPositionsParams } from './decision-page.js';
import {
  findLiveRun,
  readLiveContext,
  toDecisionMarket,
  type LiveStatusRunDependencies,
} from './live-status-context.js';
import {
  buildBalanceSection,
  buildBuyAndHoldSection,
  buildGoalSection,
  buildOpenPosition,
  buildRunSection,
} from './live-status-sections.js';
import { buildPriceRangeSection } from './live-price-range.js';
import { buildTriggersSection } from './live-status-triggers.js';
import type { LiveStatusView } from './live-status-view.js';

export type LiveStatusDependencies = LiveStatusRunDependencies & {
  readonly live: RunLiveStatusRepository;
  readonly now: () => number;
};

export type LiveStatusUseCase = (scope: OwnerScope, runId: string) => Promise<LiveStatusView>;

// O acompanhamento da simulação ao vivo numa ida só ao servidor (spec 008, RF13): seis consultas, todas por chave e com
// LIMIT (execução, versão da estratégia, último ponto, página de decisões com as velas, faixa de preço, posições), sem
// reexecutar o motor. As quatro do meio vão juntas DEPOIS da execução do dono; falha em qualquer uma é 500 (não há parte opcional).
export function createLiveStatusUseCase(dependencies: LiveStatusDependencies): LiveStatusUseCase {
  return async (scope, runId) => {
    const run = await findLiveRun(dependencies, { scope, runId });
    const [context, equityPoint, page, priceRange] = await Promise.all([
      readLiveContext(dependencies, { scope, run }),
      dependencies.live.readLatestEquityPoint(scope, run.id),
      dependencies.live.listDecisionRows(scope, run.id, {
        market: toDecisionMarket(dependencies, run),
        before: undefined,
        limit: LIVE_DECISIONS_PAGE_SIZE.DEFAULT,
      }),
      dependencies.live.readRunPriceRange(scope, run.id, toDecisionMarket(dependencies, run)),
    ]);
    const positions = await dependencies.live.listPositionsAround(
      scope,
      run.id,
      toPositionsParams({ rows: page.items, durationMilliseconds: context.durationMilliseconds }),
    );
    const { balance, view: balanceView } = buildBalanceSection(context, equityPoint);
    const openPosition = buildOpenPosition(positions);
    return {
      run: buildRunSection(context),
      balance: balanceView,
      buyAndHold: buildBuyAndHoldSection(balance, equityPoint),
      goal: buildGoalSection(context, { balance, now: dependencies.now() }),
      openPosition,
      priceRange: buildPriceRangeSection(priceRange),
      triggers: buildTriggersSection({
        context,
        rows: page.items.slice(0, 2),
        hasOpenPosition: openPosition !== null,
      }),
      decisions: toDecisionsPageView({ context, page, positions }),
    };
  };
}
