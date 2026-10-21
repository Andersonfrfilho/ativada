// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  FillInput,
  OwnerScope,
  PositionCursor,
  PositionInput,
  PositionStatus,
  ResultOrder,
  RunResultRepository,
  TimeRange,
} from '@ativada/database';

import { ORDER_SIDE } from '@ativada/strategy-engine';

import type { PageInput, PageOutput } from '../../strategies/strategy.use-cases.js';
import { encodePositionCursor } from '../run-cursor.js';
import { RunNotFoundError } from '../run.error.js';
import { computeTradeAmounts, type TradeAmounts } from './trade-amounts.js';

export type RunTradesDependencies = {
  readonly results: Pick<RunResultRepository, 'listPositions' | 'listFillsOfPositions'>;
};

export type TradesPageInput = PageInput<PositionCursor> & {
  readonly range?: TimeRange | undefined;
  readonly status?: PositionStatus | undefined;
  readonly order?: ResultOrder;
};

// Os campos antigos continuam como estavam; os novos só acrescentam (spec 005, D1).
export type TradeView = PositionInput & TradeAmounts;

export type RunTradesUseCase = (
  scope: OwnerScope,
  runId: string,
  input: TradesPageInput,
) => Promise<PageOutput<TradeView>>;

type PositionFills = { entry?: FillInput; exit?: FillInput };

function groupFills(fills: readonly FillInput[]): ReadonlyMap<string, PositionFills> {
  const grouped = new Map<string, PositionFills>();
  for (const fill of fills) {
    const group = grouped.get(fill.positionKey) ?? {};
    if (fill.side === ORDER_SIDE.BUY) group.entry = fill;
    else group.exit = fill;
    grouped.set(fill.positionKey, group);
  }
  return grouped;
}

// Uma página de posições e UMA consulta com os preenchimentos dela (sem N+1). `undefined` do repositório é execução
// inexistente OU de outro dono: o mesmo `RUN_NOT_FOUND`.
export function createRunTradesUseCase(dependencies: RunTradesDependencies): RunTradesUseCase {
  const { results } = dependencies;
  return async (scope, runId, input) => {
    const page = await results.listPositions(scope, runId, input);
    if (page === undefined) throw new RunNotFoundError();
    const keys = page.items.map((position) => position.engineKey);
    const fills = await results.listFillsOfPositions(scope, runId, keys);
    if (fills === undefined) throw new RunNotFoundError();
    const grouped = groupFills(fills);
    return {
      items: page.items.map((position) => {
        const group = grouped.get(position.engineKey);
        const amounts = computeTradeAmounts({
          position,
          entryFill: group?.entry,
          exitFill: group?.exit,
        });
        return { ...position, ...amounts };
      }),
      nextCursor: page.nextCursor === undefined ? null : encodePositionCursor(page.nextCursor),
      perPage: input.limit,
    };
  };
}
