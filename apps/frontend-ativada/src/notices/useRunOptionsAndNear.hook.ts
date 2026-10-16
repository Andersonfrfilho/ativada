// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Notice } from './notice.validation.js';
import type { NoticePreferences } from './notice-preferences.js';
import { useLiveRunOptions, type LiveRunOption } from './useLiveRunOptions.hook.js';
import { useNearTriggers, type NearTrigger } from './useNearTriggers.hook.js';

export type RunOptionsAndNear = {
  readonly runOptions: readonly LiveRunOption[];
  readonly near: {
    readonly nearTriggers: readonly NearTrigger[];
    readonly dismissNear: (key: string) => void;
  };
};

// As simulações ao vivo ajustáveis e os avisos "perto de comprar" das marcadas; a lista de execuções só é pedida quando preciso.
export function useRunOptionsAndNear(params: {
  readonly items: readonly Notice[];
  readonly drawer: { readonly isDrawerOpen: boolean };
  readonly preferences: NoticePreferences;
}): RunOptionsAndNear {
  const { items, drawer, preferences } = params;
  const runOptions = useLiveRunOptions({
    items,
    isEnabled: drawer.isDrawerOpen || preferences.earlyRunIds.length > 0,
  });
  const near = useNearTriggers({ options: runOptions, earlyRunIds: preferences.earlyRunIds });
  return { runOptions, near };
}
