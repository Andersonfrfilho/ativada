// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCallback, useMemo, useState } from 'react';

import type { Notice } from './notice.validation.js';
import { newestInstant } from './notice-events.js';
import type { NoticePreferences } from './notice-preferences.js';

export type DrawerState = {
  readonly isDrawerOpen: boolean;
  readonly openDrawer: () => void;
  readonly closeDrawer: () => void;
  readonly markAllRead: () => void;
};

// Gaveta aberta ou fechada e "Marcar todos como lidos" (o cursor de leitura vai para o aviso mais novo).
export function useDrawerState(params: {
  readonly items: readonly Notice[];
  readonly update: (change: (current: NoticePreferences) => NoticePreferences) => void;
}): DrawerState {
  const { items, update } = params;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const openDrawer = useCallback((): void => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback((): void => setIsDrawerOpen(false), []);
  const markAllRead = useCallback((): void => {
    update((current) => ({
      ...current,
      readThrough: Math.max(current.readThrough, newestInstant(items)),
    }));
  }, [update, items]);
  return useMemo(
    () => ({ isDrawerOpen, openDrawer, closeDrawer, markAllRead }),
    [isDrawerOpen, openDrawer, closeDrawer, markAllRead],
  );
}
