// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  CHANGE_REASON,
  countUnread,
  decideEffects,
  diffNotices,
  mergeNotices,
  newestInstant,
  snapshotStates,
  summarizeChanges,
  type EventContext,
} from '../src/notices/notice-events.js';
import {
  DEFAULT_NOTICE_PREFERENCES,
  noticeStorageKey,
  readNoticePreferences,
  withEarlyRun,
  withMutedRun,
  writeNoticePreferences,
} from '../src/notices/notice-preferences.js';
import { NoticeEventRouter, type RouterSink } from '../src/notices/notice-router.js';
import {
  describeDay,
  describeNoticePair,
  describeWhen,
  fillTimeTokens,
  formatSymbol,
  formatTimeframe,
} from '../src/notices/notice-text.js';
import {
  buildCancelledNotice,
  buildExitNotice,
  buildFilledNotice,
  buildNotice,
  MINUTE,
  NOTICE_NOW,
  NOTICE_RUN_ID,
  OTHER_RUN_ID,
} from './support/notice-fixtures.js';

const CONTEXT: EventContext = {
  preferences: DEFAULT_NOTICE_PREFERENCES,
  openRunId: undefined,
  isTabHidden: false,
};

function memoryStorage(initial?: string): {
  getItem: () => string | null;
  setItem: (key: string, value: string) => void;
  saved: string[];
} {
  const saved: string[] = [];
  return {
    getItem: () => initial ?? saved.at(-1) ?? null,
    setItem: (_key, value) => void saved.push(value),
    saved,
  };
}

describe('preferências (T2.1): padrões A e leitura tolerante', () => {
  test('sem nada guardado valem os padrões: tipos ligados, som e notificação desligados', () => {
    expect(readNoticePreferences('sub-1', memoryStorage())).toEqual(DEFAULT_NOTICE_PREFERENCES);
    expect(DEFAULT_NOTICE_PREFERENCES.isTradeEnabled).toBe(true);
    expect(DEFAULT_NOTICE_PREFERENCES.isStopEnabled).toBe(true);
    expect(DEFAULT_NOTICE_PREFERENCES.isSoundEnabled).toBe(false);
    expect(DEFAULT_NOTICE_PREFERENCES.isBrowserEnabled).toBe(false);
  });

  test.each([['{quebrado'], ['42'], ['null'], ['"texto"']])(
    'JSON ruim %s cai nos padrões',
    (text) => {
      expect(readNoticePreferences('sub-1', memoryStorage(text))).toEqual(
        DEFAULT_NOTICE_PREFERENCES,
      );
    },
  );

  test('campo inválido cai no padrão só nele; o resto é mantido', () => {
    const stored = JSON.stringify({
      isSoundEnabled: true,
      isTradeEnabled: 'sim',
      mutedRunIds: [1],
    });
    const read = readNoticePreferences('sub-1', memoryStorage(stored));
    expect(read.isSoundEnabled).toBe(true);
    expect(read.isTradeEnabled).toBe(true);
    expect(read.mutedRunIds).toEqual([]);
  });

  test('acesso negado ao armazenamento não derruba a tela', () => {
    const denied = {
      getItem: (): never => {
        throw new Error('negado');
      },
      setItem: (): never => {
        throw new Error('negado');
      },
    };
    expect(readNoticePreferences('sub-1', denied)).toEqual(DEFAULT_NOTICE_PREFERENCES);
    expect(() =>
      writeNoticePreferences({ subject: 'sub-1', preferences: DEFAULT_NOTICE_PREFERENCES }, denied),
    ).not.toThrow();
    expect(readNoticePreferences('sub-1', undefined)).toEqual(DEFAULT_NOTICE_PREFERENCES);
  });

  test('a chave é pelo sub opaco e a gravação só leva preferência, nunca preço nem par', () => {
    const storage = memoryStorage();
    writeNoticePreferences(
      {
        subject: 'sub-1',
        preferences: withMutedRun(DEFAULT_NOTICE_PREFERENCES, { runId: 'run-9', isMuted: true }),
      },
      storage,
    );
    expect(noticeStorageKey('sub-1')).toBe('ativada.notices.sub-1');
    expect(noticeStorageKey(undefined)).toBe('ativada.notices.anonymous');
    expect(storage.saved[0]).not.toMatch(/LINK|USDT|12[.,]/);
  });

  test('silenciar e avisar antes entram e saem da lista, sem repetir', () => {
    const muted = withMutedRun(
      withMutedRun(DEFAULT_NOTICE_PREFERENCES, { runId: 'a', isMuted: true }),
      { runId: 'a', isMuted: true },
    );
    expect(muted.mutedRunIds).toEqual(['a']);
    expect(withMutedRun(muted, { runId: 'a', isMuted: false }).mutedRunIds).toEqual([]);
    expect(
      withEarlyRun(DEFAULT_NOTICE_PREFERENCES, { runId: 'b', isEarly: true }).earlyRunIds,
    ).toEqual(['b']);
  });
});

describe('texto e horário (T2.1)', () => {
  test('par e vela legíveis', () => {
    expect(formatSymbol('LINKUSDT')).toBe('LINK/USDT');
    expect(formatSymbol('USDT')).toBe('USDT');
    expect(formatTimeframe('15m')).toBe('15 min');
    expect(formatTimeframe('4h')).toBe('4 h');
    expect(formatTimeframe('1d')).toBe('1 dia');
    expect(describeNoticePair(buildNotice())).toBe('LINK/USDT 15 min');
    expect(describeNoticePair(buildNotice({ timeframe: null }))).toBe('LINK/USDT');
  });

  test('as marcas de horário viram a hora no fuso do usuário', () => {
    const notice = buildNotice({
      occurredAt: '2026-10-16T23:15:00.000Z',
      confirmsAt: '2026-10-16T23:30:00.000Z',
    });
    expect(fillTimeTokens(notice.message, notice, 'America/Sao_Paulo')).toBe(
      'Executa pelo preço de abertura da vela das 20:15; a simulação confirma às 20:30.',
    );
    expect(fillTimeTokens(notice.message, notice, 'UTC')).toContain('das 23:15');
  });

  test('há instantes, há N min, às HH:MM e o dia', () => {
    const base = { now: NOTICE_NOW, timeZone: 'UTC' };
    const at = (minutes: number): string => new Date(NOTICE_NOW - minutes * MINUTE).toISOString();
    expect(describeWhen({ ...base, occurredAt: at(0.5) })).toBe('há instantes');
    expect(describeWhen({ ...base, occurredAt: at(5) })).toBe('há 5 min');
    expect(describeWhen({ ...base, occurredAt: at(120) })).toBe('às 18:20');
    expect(describeDay({ ...base, occurredAt: at(5) })).toBe('Hoje');
    expect(describeDay({ ...base, occurredAt: at(24 * 60) })).toBe('Ontem');
    expect(describeDay({ ...base, occurredAt: at(5 * 24 * 60) })).toBe('11/10/2026');
  });
});

describe('mesclar, trocar de estado e não lidos (T2.2)', () => {
  test('mesmo noticeId vira um aviso e o estado mais avançado vence; nunca volta', () => {
    const created = buildNotice();
    const filled = buildFilledNotice();
    expect(mergeNotices([[created], [filled]]).map((notice) => notice.state)).toEqual(['filled']);
    expect(mergeNotices([[filled], [created]]).map((notice) => notice.state)).toEqual(['filled']);
  });

  test('a lista sai do mais novo para o mais antigo', () => {
    const older = buildCancelledNotice({
      occurredAt: new Date(NOTICE_NOW - 30 * MINUTE).toISOString(),
    });
    const newer = buildExitNotice();
    expect(mergeNotices([[older, newer]]).map((notice) => notice.noticeId)).toEqual([
      newer.noticeId,
      older.noticeId,
    ]);
  });

  test('o que mudou: aviso novo e ordem que avançou; estado que volta não conta', () => {
    const known = snapshotStates([buildNotice()]);
    const changes = diffNotices(known, [buildFilledNotice(), buildExitNotice()]);
    expect(changes.map((change) => [change.notice.noticeId, change.reason])).toEqual([
      ['order:run:order-1', CHANGE_REASON.STATE_CHANGED],
      ['exit:run:position-1', CHANGE_REASON.NEW],
    ]);
    expect(diffNotices(snapshotStates([buildFilledNotice()]), [buildNotice()])).toEqual([]);
  });

  test('não lido é o que aconteceu depois do cursor de leitura', () => {
    const items = [
      buildExitNotice(),
      buildNotice({ occurredAt: new Date(NOTICE_NOW - 60 * MINUTE).toISOString() }),
    ];
    expect(countUnread(items, 0)).toBe(2);
    expect(countUnread(items, NOTICE_NOW - 30 * MINUTE)).toBe(1);
    expect(countUnread(items, newestInstant(items))).toBe(0);
  });
});

describe('o que cada aviso faz (RF15, RF06, RF14)', () => {
  test('padrão: toast e anúncio; som só ligado; notificação só com a aba escondida', () => {
    const filled = buildFilledNotice();
    expect(decideEffects(filled, CONTEXT)).toEqual({
      isToast: true,
      isSound: false,
      isBrowserNotification: false,
      isAnnounced: true,
    });
    const loud = { ...CONTEXT.preferences, isSoundEnabled: true, isBrowserEnabled: true };
    expect(decideEffects(filled, { ...CONTEXT, preferences: loud }).isSound).toBe(true);
    const hidden = decideEffects(filled, { ...CONTEXT, preferences: loud, isTabHidden: true });
    expect(hidden.isBrowserNotification).toBe(true);
    expect(hidden.isSound).toBe(false);
  });

  test('ordem pedida nunca faz som nem notificação', () => {
    const loud = { ...CONTEXT.preferences, isSoundEnabled: true, isBrowserEnabled: true };
    expect(decideEffects(buildNotice(), { ...CONTEXT, preferences: loud })).toMatchObject({
      isSound: false,
      isToast: true,
    });
    expect(
      decideEffects(buildNotice(), { ...CONTEXT, preferences: loud, isTabHidden: true })
        .isBrowserNotification,
    ).toBe(false);
  });

  test('desligar o tipo ou silenciar a simulação tira tudo; o sino continua contando', () => {
    const tradesOff = { ...CONTEXT.preferences, isTradeEnabled: false, isSoundEnabled: true };
    expect(decideEffects(buildFilledNotice(), { ...CONTEXT, preferences: tradesOff })).toEqual({
      isToast: false,
      isSound: false,
      isBrowserNotification: false,
      isAnnounced: false,
    });
    const muted = withMutedRun(DEFAULT_NOTICE_PREFERENCES, { runId: NOTICE_RUN_ID, isMuted: true });
    expect(decideEffects(buildFilledNotice(), { ...CONTEXT, preferences: muted }).isToast).toBe(
      false,
    );
    expect(
      decideEffects(buildFilledNotice({ runId: OTHER_RUN_ID }), { ...CONTEXT, preferences: muted })
        .isToast,
    ).toBe(true);
  });

  test('parada obedece ao interruptor de paradas, não ao de compras', () => {
    const stalled = buildNotice({ kind: 'run', state: 'done', reasonCode: 'run.stalled' });
    const stopOff = { ...CONTEXT.preferences, isStopEnabled: false };
    expect(decideEffects(stalled, { ...CONTEXT, preferences: stopOff }).isToast).toBe(false);
    expect(decideEffects(stalled, CONTEXT).isToast).toBe(true);
  });

  test('a simulação aberta na tela não ganha toast nem anúncio (o gráfico já mostra)', () => {
    const effects = decideEffects(buildFilledNotice(), { ...CONTEXT, openRunId: NOTICE_RUN_ID });
    expect(effects.isToast).toBe(false);
    expect(effects.isAnnounced).toBe(false);
  });
});

describe('o roteador (T2.2): linha de base, mudanças, resumo e aba escondida', () => {
  function build(overrides: { now?: () => number } = {}): {
    router: NoticeEventRouter;
    log: string[];
    clock: { now: number };
  } {
    const log: string[] = [];
    const clock = { now: 1_000 };
    const sink: RouterSink = {
      toast: (notice) => void log.push(`toast:${notice.noticeId}:${notice.state}`),
      sound: (notice) => void log.push(`sound:${notice.noticeId}`),
      notify: (notice) => void log.push(`notify:${notice.noticeId}`),
      announce: (notice) => void log.push(`announce:${notice.noticeId}`),
      summary: (text) => void log.push(`summary:${text}`),
    };
    const router = new NoticeEventRouter({
      sink,
      getContext: (): EventContext => CONTEXT,
      now: overrides.now ?? ((): number => clock.now),
      summaryDelayMilliseconds: 5,
      awayWindowMilliseconds: 1_000,
    });
    return { router, log, clock };
  }

  test('o primeiro carregamento é só a linha de base: nenhum toast', () => {
    const { router, log } = build();
    router.ingest('runs', [buildNotice(), buildExitNotice()]);
    expect(log).toEqual([]);
  });

  test('aviso novo e troca de estado geram toast e anúncio, um por mudança', () => {
    const { router, log } = build();
    router.ingest('runs', [buildNotice()]);
    router.ingest('runs', [buildFilledNotice()]);
    router.ingest('runs', [buildFilledNotice(), buildExitNotice()]);
    expect(log).toEqual([
      'toast:order:run:order-1:filled',
      'announce:order:run:order-1',
      'toast:exit:run:position-1:done',
      'announce:exit:run:position-1',
    ]);
  });

  test('assuntos diferentes têm linhas de base diferentes: o alerta de preço antigo não vira toast', () => {
    const { router, log } = build();
    router.ingest('runs', [buildNotice()]);
    router.ingest('price-alerts', [
      buildNotice({ noticeId: 'price_alert:1', kind: 'price_alert', runId: null }),
    ]);
    expect(log).toEqual([]);
  });

  test('depois de religar, as mudanças viram UM resumo e nenhum toast individual', async () => {
    const { router, log } = build();
    router.ingest('runs', []);
    router.beginAway();
    router.ingest('runs', [buildFilledNotice(), buildExitNotice(), buildCancelledNotice()]);
    await Bun.sleep(30);
    expect(log).toEqual([
      'summary:Enquanto você estava fora: 2 operações (1 compra, 1 venda) e 1 ordem cancelada.',
    ]);
  });

  test('aba escondida: só a notificação; ao voltar depressa vêm os toasts, depois de mais de 60 s vem o resumo', () => {
    const quick = build();
    quick.router.ingest('runs', []);
    quick.router.setHidden(true);
    quick.router.ingest('runs', [buildFilledNotice()]);
    expect(quick.log).toEqual([]);
    quick.clock.now += 10_000;
    quick.router.setHidden(false);
    expect(quick.log).toEqual(['toast:order:run:order-1:filled', 'announce:order:run:order-1']);

    const long = build();
    long.router.ingest('runs', []);
    long.router.setHidden(true);
    long.router.ingest('runs', [buildFilledNotice(), buildExitNotice()]);
    long.clock.now += 61_000;
    long.router.setHidden(false);
    expect(long.log).toEqual([
      'summary:Enquanto você estava fora: 2 operações (1 compra, 1 venda).',
    ]);
  });

  test('o resumo sem nada para dizer não aparece', () => {
    expect(summarizeChanges([])).toBeUndefined();
  });
});
