// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCallback, useEffect, type RefObject } from 'react';
import { useNavigate } from 'react-router';

import type { Notice } from './notice.validation.js';
import type { NoticePreferences } from './notice-preferences.js';
import { buildNoticeTarget } from './notice-tone.js';

export type OpenNotice = (notice: Notice) => void;

type OpenNoticeParams = {
  readonly closeDrawer: () => void;
  readonly dismissToast: (noticeId: string) => void;
  readonly update: (change: (current: NoticePreferences) => NoticePreferences) => void;
  // Ponte para a notificação do navegador, criada antes de este gancho existir.
  readonly bridge: RefObject<OpenNotice>;
};

// Abrir um aviso (toast, item da gaveta ou notificação do sistema): vai à tela, fecha gaveta e toast e marca como lido.
export function useOpenNotice(params: OpenNoticeParams): OpenNotice {
  const { closeDrawer, dismissToast, update, bridge } = params;
  const navigate = useNavigate();
  const openNotice = useCallback(
    (notice: Notice): void => {
      const occurredAt = Date.parse(notice.occurredAt);
      update((current) => ({ ...current, readThrough: Math.max(current.readThrough, occurredAt) }));
      dismissToast(notice.noticeId);
      closeDrawer();
      const target = buildNoticeTarget(notice);
      if (target !== undefined) void navigate(target);
    },
    [update, dismissToast, closeDrawer, navigate],
  );
  useEffect(() => {
    bridge.current = openNotice;
  }, [bridge, openNotice]);
  return openNotice;
}
