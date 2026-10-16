// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { NoticeCenter } from './notice-center.types.js';
import type { DrawerState } from './useDrawerState.hook.js';
import type { NoticeFeed } from './useNoticeFeed.hook.js';
import type { PreferencesState } from './useNoticePreferences.hook.js';

type CenterParts = {
  readonly feed: NoticeFeed;
  readonly view: Pick<
    NoticeCenter,
    'toasts' | 'summary' | 'announcement' | 'dismissToast' | 'dismissSummary'
  >;
  readonly drawer: DrawerState;
  readonly preferences: PreferencesState;
  readonly unreadCount: number;
  readonly connection: NoticeCenter['connection'];
  readonly timeZone: string;
  readonly now: number;
  readonly toastMilliseconds: number;
};

// Junta o que cada hook entrega no valor único que o sino, a gaveta e a pilha de avisos leem.
export function buildNoticeCenter(parts: CenterParts): NoticeCenter {
  return {
    ...parts.feed,
    ...parts.view,
    ...parts.drawer,
    unreadCount: parts.unreadCount,
    connection: parts.connection,
    preferences: parts.preferences.preferences,
    updatePreferences: parts.preferences.update,
    timeZone: parts.timeZone,
    now: parts.now,
    toastMilliseconds: parts.toastMilliseconds,
  };
}
