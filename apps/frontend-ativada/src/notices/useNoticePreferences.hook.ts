// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useCallback, useMemo, useState } from 'react';

import {
  readNoticePreferences,
  writeNoticePreferences,
  type NoticePreferences,
} from './notice-preferences.js';

export type PreferencesState = {
  readonly preferences: NoticePreferences;
  readonly update: (change: (current: NoticePreferences) => NoticePreferences) => void;
};

// As preferências deste navegador (por `sub`): lidas uma vez, gravadas a cada mudança, sem nunca derrubar a tela.
export function useNoticePreferences(subject: string | undefined): PreferencesState {
  const [preferences, setPreferences] = useState(() => readNoticePreferences(subject));
  const update = useCallback(
    (change: (current: NoticePreferences) => NoticePreferences): void => {
      setPreferences((current) => {
        const next = change(current);
        writeNoticePreferences({ subject, preferences: next });
        return next;
      });
    },
    [subject],
  );
  return useMemo(() => ({ preferences, update }), [preferences, update]);
}
