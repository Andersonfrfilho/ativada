// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HITS_ANCHOR } from '../live-tracking/live-anchors.js';
import { TRACKING_ANCHOR } from '../live-tracking/LiveTrackingCard.component.js';
import { DECISIONS_ANCHOR, TRIGGERS_ANCHOR } from '../live-tracking/LiveTradesState.component.js';

// As abas da simulação ao vivo, abaixo da sala de operações. As âncoras antigas (`#acompanhamento`, `#decisoes`, `#falta`,
// `#acertos`) continuam valendo: o endereço com uma delas abre a aba certa.
export const LIVE_TAB = {
  OPERATIONS: 'operacoes',
  DECISIONS: DECISIONS_ANCHOR,
  TRIGGERS: TRIGGERS_ANCHOR,
  HITS: HITS_ANCHOR,
  TRACKING: TRACKING_ANCHOR,
} as const;

export type LiveTab = (typeof LIVE_TAB)[keyof typeof LIVE_TAB];

export const LIVE_TABS: readonly { readonly key: LiveTab; readonly label: string }[] = [
  { key: LIVE_TAB.OPERATIONS, label: 'Operações' },
  { key: LIVE_TAB.DECISIONS, label: 'Decisões' },
  { key: LIVE_TAB.TRIGGERS, label: 'O que falta' },
  { key: LIVE_TAB.HITS, label: 'Acertos' },
  { key: LIVE_TAB.TRACKING, label: 'Acompanhamento' },
];

export function tabOfHash(hash: string): LiveTab | undefined {
  const key = hash.replace(/^#/, '');
  return LIVE_TABS.find((tab) => tab.key === key)?.key;
}

// Setas e Home/End andam entre as abas (padrão de abas do WAI-ARIA).
export function nextTab(current: LiveTab, key: string): LiveTab | undefined {
  const index = LIVE_TABS.findIndex((tab) => tab.key === current);
  const last = LIVE_TABS.length - 1;
  const target =
    key === 'ArrowRight'
      ? (index + 1) % LIVE_TABS.length
      : key === 'ArrowLeft'
        ? (index + last) % LIVE_TABS.length
        : key === 'Home'
          ? 0
          : key === 'End'
            ? last
            : undefined;
  return target === undefined ? undefined : LIVE_TABS[target]?.key;
}
