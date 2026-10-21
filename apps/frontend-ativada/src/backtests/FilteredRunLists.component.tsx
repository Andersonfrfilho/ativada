// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { RUN_KIND } from '../runs/run.constant.js';
import { RunListCard, type RunSelection } from './RunListCard.component.js';
import type { RunFilters } from './useRunFilters.hook.js';

export type FilteredRunListsProps = {
  readonly filters: RunFilters;
  readonly selection: RunSelection;
};

// O tipo escolhido esconde a outra lista; o par vai às duas, e à API.
export function FilteredRunLists({ filters, selection }: FilteredRunListsProps): ReactElement {
  const { kind, symbol } = filters;
  return (
    <>
      {kind === undefined || kind === RUN_KIND.BACKTEST ? (
        <RunListCard
          kind={RUN_KIND.BACKTEST}
          title="Backtests"
          moreLabel="Carregar mais backtests"
          symbol={symbol}
          selection={selection}
        />
      ) : null}
      {kind === undefined || kind === RUN_KIND.WALK_FORWARD ? (
        <RunListCard
          kind={RUN_KIND.WALK_FORWARD}
          title="Walk-forward"
          moreLabel="Carregar mais walk-forwards"
          symbol={symbol}
        />
      ) : null}
    </>
  );
}
