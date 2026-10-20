// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo, type ReactElement, type ReactNode } from 'react';

import { buildNoticeCenter } from './notice-center-value.js';
import { NoticeCenterContext } from './notice-center.types.js';
import { useCenterParts } from './useCenterParts.hook.js';

// Um centro de avisos para o painel autenticado inteiro: o sino, a gaveta e a pilha de avisos leem daqui.
export function NoticeCenterProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const parts = useCenterParts();
  const { feed, view, drawer, preferences, unreadCount, connection, timeZone, now } = parts;
  const { openNotice } = parts;
  const { toastMilliseconds, runOptions, near } = parts;
  const value = useMemo(
    () =>
      buildNoticeCenter({
        feed,
        view,
        drawer,
        openNotice,
        preferences,
        unreadCount,
        connection,
        timeZone,
        now,
        toastMilliseconds,
        runOptions,
        near,
      }),
    [
      feed,
      view,
      drawer,
      openNotice,
      preferences,
      unreadCount,
      connection,
      timeZone,
      now,
      toastMilliseconds,
      runOptions,
      near,
    ],
  );
  return <NoticeCenterContext value={value}>{children}</NoticeCenterContext>;
}
