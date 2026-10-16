// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useMatch } from 'react-router';

import { useUserTimeZone } from '../account/useUserTimeZone.hook.js';
import { ROUTE_PATH } from '../app/app.constant.js';
import { useAppConfig, useSessionService } from '../app/useAppContext.hook.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import { CONNECTION_STRIP_MILLISECONDS, TOAST_LIFETIME_MILLISECONDS } from './notice.constant.js';
import { buildNoticeCenter } from './notice-center-value.js';
import { NoticeCenterContext } from './notice-center.types.js';
import { countUnread } from './notice-events.js';
import { useConnectionNotice } from './useConnectionNotice.hook.js';
import { useDrawerState } from './useDrawerState.hook.js';
import { useNoticeFeed } from './useNoticeFeed.hook.js';
import { useNoticePreferences } from './useNoticePreferences.hook.js';
import { useNoticeRouting } from './useNoticeRouting.hook.js';
import { useTabHidden } from './useTabHidden.hook.js';
import { useTabTitle } from './useTabTitle.hook.js';

// Um centro de avisos para o painel autenticado inteiro: o sino, a gaveta e a pilha de avisos leem daqui.
export function NoticeCenterProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const feed = useNoticeFeed();
  const prefs = useNoticePreferences(useSessionService().readSubject());
  const config = useAppConfig();
  const { streamStatus, now } = useLiveMarket();
  const isHidden = useTabHidden();
  const timeZone = useUserTimeZone();
  const openRunId = useMatch(ROUTE_PATH.BACKTEST)?.params['runId'];
  const drawer = useDrawerState({ items: feed.items, update: prefs.update });
  const { preferences } = prefs;
  const routing = useNoticeRouting({ feed, preferences, openRunId, isHidden, timeZone });
  const connection = useConnectionNotice({
    status: streamStatus,
    onReturn: routing.beginAway,
    stripMilliseconds: config.noticeConnectionMilliseconds ?? CONNECTION_STRIP_MILLISECONDS,
  });
  const unreadCount = countUnread(feed.items, preferences.readThrough);
  const toastMilliseconds = config.noticeToastMilliseconds ?? TOAST_LIFETIME_MILLISECONDS;
  useTabTitle({ unreadCount, isHidden });

  const value = useMemo(
    () =>
      buildNoticeCenter({
        feed,
        view: routing.view,
        drawer,
        preferences: prefs,
        unreadCount,
        connection,
        timeZone,
        now,
        toastMilliseconds,
      }),
    [feed, routing.view, drawer, prefs, unreadCount, connection, timeZone, now, toastMilliseconds],
  );
  return <NoticeCenterContext value={value}>{children}</NoticeCenterContext>;
}
