// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '../../runs/run.constant.js';

export const RECENT_RUNS_STORAGE_KEY = 'ativada.recent-runs';
export const RECENT_RUNS_LIMIT = 5;
export const SWITCH_SHORTCUT_PREVIOUS = '[';
export const SWITCH_SHORTCUT_NEXT = ']';

export type SwitchGroup = { readonly kind: RunKind; readonly title: string };

// A ordem dos grupos da lista: o que está rodando agora primeiro.
export const SWITCH_GROUPS: readonly SwitchGroup[] = [
  { kind: RUN_KIND.LIVE_PAPER, title: 'Ao vivo' },
  { kind: RUN_KIND.BACKTEST, title: 'Backtests' },
  { kind: RUN_KIND.WALK_FORWARD, title: 'Walk-forward' },
];

const KIND_WORD: Readonly<Record<string, string>> = {
  [RUN_KIND.LIVE_PAPER]: 'Ao vivo',
  [RUN_KIND.BACKTEST]: 'Backtest',
  [RUN_KIND.WALK_FORWARD]: 'Walk-forward',
};

// Tipo que este painel não conhece aparece como veio, sem derrubar a lista.
export function kindWord(kind: string): string {
  return KIND_WORD[kind] ?? kind;
}
