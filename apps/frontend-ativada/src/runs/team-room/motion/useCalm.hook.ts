// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useSyncExternalStore } from 'react';

import { readCalm, subscribeCalm, writeCalm } from './calm-store.js';

export type CalmControls = {
  readonly isCalm: boolean;
  readonly setCalm: (isCalm: boolean) => void;
};

export function useCalm(): CalmControls {
  const isCalm = useSyncExternalStore(subscribeCalm, readCalm, () => false);
  return { isCalm, setCalm: writeCalm };
}
