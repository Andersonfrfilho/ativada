// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { Decision } from '../live-tracking/live-status.validation.js';

export type TeamRoomReview = {
  readonly shown: Decision | undefined;
  readonly isReviewing: boolean;
  readonly previous: Decision | undefined;
  readonly next: Decision | undefined;
  readonly goTo: (decision: Decision) => void;
  readonly backToNow: () => void;
};

type Pick = { readonly time: number; readonly latestAt: number };

// Rever velas: a vela escolhida vale enquanto a mais recente for a mesma de quando se escolheu; vela nova volta para "agora".
export function useTeamRoomReview(decisions: readonly Decision[]): TeamRoomReview {
  const [pick, setPick] = useState<Pick | undefined>(undefined);
  const latest = decisions[0];
  const isPickValid = pick !== undefined && pick.latestAt === latest?.candleTime;
  const found = isPickValid ? decisions.findIndex((item) => item.candleTime === pick.time) : 0;
  const index = Math.max(found, 0);
  return {
    shown: decisions[index],
    isReviewing: index > 0,
    previous: decisions[index + 1],
    next: index > 0 ? decisions[index - 1] : undefined,
    goTo: (decision): void => {
      if (latest === undefined) return;
      setPick({ time: decision.candleTime, latestAt: latest.candleTime });
    },
    backToNow: () => setPick(undefined),
  };
}
