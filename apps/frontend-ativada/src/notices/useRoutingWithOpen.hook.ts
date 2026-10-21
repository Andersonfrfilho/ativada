// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef } from 'react';

import type { DrawerState } from './useDrawerState.hook.js';
import type { NoticeFeed } from './useNoticeFeed.hook.js';
import type { PreferencesState } from './useNoticePreferences.hook.js';
import { useNoticeRouting } from './useNoticeRouting.hook.js';
import { useOpenNotice, type OpenNotice } from './useOpenNotice.hook.js';

type Params = {
  readonly feed: NoticeFeed;
  readonly openRunId: string | undefined;
  readonly isHidden: boolean;
  readonly timeZone: string;
  readonly drawer: DrawerState;
  readonly prefs: PreferencesState;
};

// O roteador dos avisos mais o "abrir aviso", que a notificação do navegador chama pela ponte.
export function useRoutingWithOpen(params: Params): ReturnType<typeof useNoticeRouting> & {
  readonly openNotice: OpenNotice;
} {
  const { drawer, prefs, ...routingParams } = params;
  const openBridge = useRef<OpenNotice>(() => undefined);
  const routing = useNoticeRouting({
    ...routingParams,
    preferences: prefs.preferences,
    openBridge,
  });
  const openNotice = useOpenNotice({
    closeDrawer: drawer.closeDrawer,
    dismissToast: routing.view.dismissToast,
    update: prefs.update,
    bridge: openBridge,
  });
  return { ...routing, openNotice };
}
