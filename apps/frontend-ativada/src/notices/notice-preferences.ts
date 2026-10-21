// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { ANONYMOUS_SUBJECT, NOTICE_STORAGE_PREFIX } from './notice.constant.js';

const MAXIMUM_RUN_IDS = 50;

// Só preferência e cursor de leitura deste navegador (D2-A): nenhum preço, par ou dado pessoal; chave pelo `sub` opaco.
const preferencesSchema = z.object({
  isTradeEnabled: z.boolean().catch(true),
  isStopEnabled: z.boolean().catch(true),
  isSoundEnabled: z.boolean().catch(false),
  isBrowserEnabled: z.boolean().catch(false),
  mutedRunIds: z.array(z.string()).max(MAXIMUM_RUN_IDS).catch([]),
  earlyRunIds: z.array(z.string()).max(MAXIMUM_RUN_IDS).catch([]),
  readThrough: z.number().nonnegative().catch(0),
  hasSeenCoach: z.boolean().catch(false),
});

export type NoticePreferences = z.infer<typeof preferencesSchema>;
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_NOTICE_PREFERENCES: NoticePreferences = {
  isTradeEnabled: true,
  isStopEnabled: true,
  isSoundEnabled: false,
  isBrowserEnabled: false,
  mutedRunIds: [],
  earlyRunIds: [],
  readThrough: 0,
  hasSeenCoach: false,
};

function defaultStorage(): PreferenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function noticeStorageKey(subject: string | undefined): string {
  return `${NOTICE_STORAGE_PREFIX}${subject ?? ANONYMOUS_SUBJECT}`;
}

function parseStored(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

// Armazenamento negado, JSON quebrado ou campo inválido caem no padrão A, campo a campo; nunca derrubam a tela.
export function readNoticePreferences(
  subject: string | undefined,
  storage: PreferenceStorage | undefined = defaultStorage(),
): NoticePreferences {
  try {
    const stored = parseStored(storage?.getItem(noticeStorageKey(subject)) ?? null);
    const parsed = preferencesSchema.safeParse(stored ?? {});
    return parsed.success ? parsed.data : DEFAULT_NOTICE_PREFERENCES;
  } catch {
    return DEFAULT_NOTICE_PREFERENCES;
  }
}

export function writeNoticePreferences(
  params: { readonly subject: string | undefined; readonly preferences: NoticePreferences },
  storage: PreferenceStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(noticeStorageKey(params.subject), JSON.stringify(params.preferences));
  } catch {
    return;
  }
}

function toggleId(ids: readonly string[], id: string, isPresent: boolean): string[] {
  const without = ids.filter((candidate) => candidate !== id);
  return isPresent ? [id, ...without].slice(0, MAXIMUM_RUN_IDS) : without;
}

export function withMutedRun(
  preferences: NoticePreferences,
  params: { readonly runId: string; readonly isMuted: boolean },
): NoticePreferences {
  return {
    ...preferences,
    mutedRunIds: toggleId(preferences.mutedRunIds, params.runId, params.isMuted),
  };
}

export function withEarlyRun(
  preferences: NoticePreferences,
  params: { readonly runId: string; readonly isEarly: boolean },
): NoticePreferences {
  return {
    ...preferences,
    earlyRunIds: toggleId(preferences.earlyRunIds, params.runId, params.isEarly),
  };
}
