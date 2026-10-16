// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import type { Announcement, NoticeCenter, ToastEntry } from './notice-center.types.js';
import type { EventContext } from './notice-events.js';
import { NoticeEventRouter } from './notice-router.js';
import { fillTimeTokens } from './notice-text.js';
import { showBrowserNotification } from './notice-browser.js';
import { playNoticeSound } from './notice-sound.js';
import type { Notice } from './notice.validation.js';
import type { NoticePreferences } from './notice-preferences.js';
import type { NoticeFeed } from './useNoticeFeed.hook.js';

const SUMMARY_DELAY_MILLISECONDS = 400;
const AWAY_WINDOW_MILLISECONDS = 10_000;
const TOAST_STACK_MAXIMUM = 20;

type RoutingParams = {
  readonly feed: NoticeFeed;
  readonly preferences: NoticePreferences;
  readonly openRunId: string | undefined;
  readonly isHidden: boolean;
  readonly timeZone: string;
};

type LiveContext = { readonly context: EventContext; readonly timeZone: string };

type RoutingView = Pick<
  NoticeCenter,
  'toasts' | 'summary' | 'announcement' | 'dismissToast' | 'dismissSummary'
>;

// Mesmo `noticeId` troca de estado NO LUGAR (sem empilhar três); aviso novo entra em cima.
export function upsertToast(current: readonly ToastEntry[], notice: Notice): readonly ToastEntry[] {
  const index = current.findIndex((entry) => entry.notice.noticeId === notice.noticeId);
  const previous = current[index];
  if (previous === undefined) {
    return [{ notice, version: 0 }, ...current].slice(0, TOAST_STACK_MAXIMUM);
  }
  return current.map((entry, position) =>
    position === index ? { notice, version: previous.version + 1 } : entry,
  );
}

function speak(notice: Notice, timeZone: string, id: number): Announcement {
  const message = fillTimeTokens(notice.message, notice, timeZone);
  return { text: `${notice.title}. ${message}`, id };
}

type Setters = {
  readonly setToasts: (change: (current: readonly ToastEntry[]) => readonly ToastEntry[]) => void;
  readonly setSummary: (text: string) => void;
  readonly setAnnouncement: (change: (current: Announcement) => Announcement) => void;
};

function createRouter(live: RefObject<LiveContext>, setters: Setters): NoticeEventRouter {
  return new NoticeEventRouter({
    now: (): number => Date.now(),
    getContext: (): EventContext => live.current.context,
    summaryDelayMilliseconds: SUMMARY_DELAY_MILLISECONDS,
    awayWindowMilliseconds: AWAY_WINDOW_MILLISECONDS,
    sink: {
      toast: (notice): void => setters.setToasts((current) => upsertToast(current, notice)),
      sound: playNoticeSound,
      notify: (notice): void => showBrowserNotification(notice, live.current.timeZone),
      announce: (notice): void =>
        setters.setAnnouncement((current) => speak(notice, live.current.timeZone, current.id + 1)),
      summary: setters.setSummary,
    },
  });
}

function useRouterFeed(router: NoticeEventRouter, feed: NoticeFeed, isHidden: boolean): void {
  useEffect(() => {
    if (feed.runFirstPage !== undefined) router.ingest('runs', feed.runFirstPage);
  }, [router, feed.runFirstPage]);
  useEffect(() => {
    if (feed.priceItems !== undefined) router.ingest('price-alerts', feed.priceItems);
  }, [router, feed.priceItems]);
  useEffect(() => router.setHidden(isHidden), [router, isHidden]);
  useEffect(() => router.stop, [router]);
}

// Liga a lista de avisos do servidor ao que a pessoa vê (pilha), ouve (som) e recebe (notificação), por um roteador puro.
export function useNoticeRouting(params: RoutingParams): {
  readonly view: RoutingView;
  readonly beginAway: () => void;
} {
  const { feed, preferences, openRunId, isHidden, timeZone } = params;
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const [summary, setSummary] = useState<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', id: 0 });
  const live = useRef<LiveContext>({
    context: { preferences, openRunId, isTabHidden: isHidden },
    timeZone,
  });
  useEffect(() => {
    live.current = { context: { preferences, openRunId, isTabHidden: isHidden }, timeZone };
  }, [preferences, openRunId, isHidden, timeZone]);

  const router = useMemo(() => createRouter(live, { setToasts, setSummary, setAnnouncement }), []);
  useRouterFeed(router, feed, isHidden);

  const dismissToast = useCallback(
    (noticeId: string): void =>
      setToasts((current) => current.filter((entry) => entry.notice.noticeId !== noticeId)),
    [],
  );
  const dismissSummary = useCallback((): void => setSummary(undefined), []);
  const view = useMemo(
    () => ({ toasts, summary, announcement, dismissToast, dismissSummary }),
    [toasts, summary, announcement, dismissToast, dismissSummary],
  );
  return { view, beginAway: router.beginAway };
}
