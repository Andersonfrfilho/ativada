// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo } from 'react';

import { RUN_KIND } from '../runs/run.constant.js';
import { useRunListQuery } from '../runs/runs.query.js';
import type { Notice } from './notice.validation.js';
import { describeNoticePair } from './notice-text.js';

const RUNNING_STATUS = 'running';

export type LiveRunOption = {
  readonly runId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly label: string;
  readonly isRunning: boolean;
};

function fromNotices(items: readonly Notice[]): LiveRunOption[] {
  const seen = new Map<string, LiveRunOption>();
  for (const notice of items) {
    if (notice.runId === null || notice.timeframe === null || seen.has(notice.runId)) continue;
    seen.set(notice.runId, {
      runId: notice.runId,
      symbol: notice.symbol,
      timeframe: notice.timeframe,
      label: describeNoticePair(notice),
      isRunning: false,
    });
  }
  return [...seen.values()];
}

// As simulações ao vivo que a pessoa pode ajustar: as que já têm aviso e as que estão rodando agora (a lista só é pedida quando preciso).
export function useLiveRunOptions(params: {
  readonly items: readonly Notice[];
  readonly isEnabled: boolean;
}): readonly LiveRunOption[] {
  const live = useRunListQuery(RUN_KIND.LIVE_PAPER, undefined, params.isEnabled);
  const pages = live.data?.pages;
  return useMemo(() => {
    const options = new Map(fromNotices(params.items).map((option) => [option.runId, option]));
    for (const run of (pages ?? []).flatMap((page) => page.items)) {
      const isRunning = run.status === RUNNING_STATUS;
      const known = options.get(run.id);
      const pair = `${run.symbol} ${run.timeframe}`;
      options.set(run.id, {
        runId: run.id,
        symbol: run.symbol,
        timeframe: run.timeframe,
        label: known?.label ?? pair,
        isRunning,
      });
    }
    return [...options.values()];
  }, [params.items, pages]);
}
