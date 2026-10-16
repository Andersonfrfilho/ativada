// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext } from 'react';

import type { Notice } from './notice.validation.js';
import type { NoticePreferences } from './notice-preferences.js';

export const CONNECTION_NOTICE = { OK: 'ok', PAUSED: 'paused', ENDED: 'ended' } as const;
export type ConnectionNotice = (typeof CONNECTION_NOTICE)[keyof typeof CONNECTION_NOTICE];

// O texto do ÚNICO aria-live; `id` muda a cada fala para o mesmo texto ser dito de novo.
export type Announcement = { readonly text: string; readonly id: number };

// Um aviso na pilha; `version` muda quando a ordem troca de estado no lugar (reinicia os 8 s).
export type ToastEntry = { readonly notice: Notice; readonly version: number };

export type NoticeCenter = {
  readonly items: readonly Notice[];
  readonly unreadCount: number;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly hasOlder: boolean;
  readonly isLoadingOlder: boolean;
  readonly loadOlder: () => void;
  readonly toasts: readonly ToastEntry[];
  readonly summary: string | undefined;
  readonly announcement: Announcement;
  readonly connection: ConnectionNotice;
  readonly preferences: NoticePreferences;
  readonly timeZone: string;
  readonly now: number;
  readonly toastMilliseconds: number;
  readonly isDrawerOpen: boolean;
  readonly openDrawer: () => void;
  readonly closeDrawer: () => void;
  readonly markAllRead: () => void;
  readonly dismissToast: (noticeId: string) => void;
  readonly dismissSummary: () => void;
  readonly updatePreferences: (change: (current: NoticePreferences) => NoticePreferences) => void;
};

export const NoticeCenterContext = createContext<NoticeCenter | undefined>(undefined);
