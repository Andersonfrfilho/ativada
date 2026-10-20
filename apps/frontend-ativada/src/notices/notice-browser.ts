// Copyright (c) 2026 Ada Technology. All rights reserved.
import { NOTICE_KIND, NOTICE_STATE } from './notice.constant.js';
import type { Notice } from './notice.validation.js';
import { describeNoticePair, fillTimeTokens, formatSymbol } from './notice-text.js';

export const PERMISSION = { GRANTED: 'granted', DENIED: 'denied', DEFAULT: 'default' } as const;
export type NotificationPermissionState = (typeof PERMISSION)[keyof typeof PERMISSION];

const FICTIONAL_MONEY = 'Simulação com dinheiro fictício.';
const SEGMENT_SEPARATOR = ' · ';
const TARGET_PREFIX = 'vender no alvo';

function readNotification(): typeof Notification | undefined {
  const scope: { readonly Notification?: typeof Notification } = globalThis;
  return scope.Notification;
}

export function readNoticePermission(): NotificationPermissionState | 'unsupported' {
  const constructor = readNotification();
  return constructor === undefined ? 'unsupported' : constructor.permission;
}

// O único lugar que pede a permissão do navegador, e só quando a pessoa clica em "Ativar notificações".
export async function requestNoticePermission(): Promise<
  NotificationPermissionState | 'unsupported'
> {
  const constructor = readNotification();
  if (constructor === undefined) return 'unsupported';
  return constructor.requestPermission();
}

function describeBuy(notice: Notice): { readonly title: string; readonly body: string } {
  const [first = '', ...rest] = notice.message.replace(/\.$/, '').split(SEGMENT_SEPARATOR);
  const levels = rest.map((part) =>
    part.startsWith(TARGET_PREFIX) ? `Alvo${part.slice(TARGET_PREFIX.length)}` : part,
  );
  const body = levels.length === 0 ? '' : `${levels.join(SEGMENT_SEPARATOR)}. `;
  return {
    title: `▲ ${first.replace(': ', SEGMENT_SEPARATOR)}`,
    body: `${body}${FICTIONAL_MONEY}`,
  };
}

function describeSell(notice: Notice): { readonly title: string; readonly body: string } {
  const [first = '', ...rest] = notice.message.split('. ');
  const pair = formatSymbol(notice.symbol);
  const title = first.replace(': sair a ', `${SEGMENT_SEPARATOR}${pair} a `);
  return { title: `▼ ${title}`, body: `${[...rest].join('. ')} ${FICTIONAL_MONEY}`.trim() };
}

// D9-A: com par e preço. A frase é a do servidor; o fuso do usuário troca as marcas de horário.
export function describeNotification(
  notice: Notice,
  timeZone: string,
): { readonly title: string; readonly body: string } {
  if (notice.kind === NOTICE_KIND.ENTRY && notice.state === NOTICE_STATE.FILLED) {
    return describeBuy(notice);
  }
  if (notice.kind === NOTICE_KIND.EXIT) return describeSell(notice);
  const message = fillTimeTokens(notice.message, notice, timeZone);
  return {
    title: `${notice.title}${SEGMENT_SEPARATOR}${describeNoticePair(notice)}`,
    body: `${message} ${FICTIONAL_MONEY}`,
  };
}

// `tag` = `noticeId`, então duas abas abertas não duplicam a notificação.
export function showBrowserNotification(params: {
  readonly notice: Notice;
  readonly timeZone: string;
  readonly onOpen: (notice: Notice) => void;
}): void {
  const { notice, timeZone, onOpen } = params;
  const constructor = readNotification();
  if (constructor === undefined || constructor.permission !== PERMISSION.GRANTED) return;
  const { title, body } = describeNotification(notice, timeZone);
  try {
    const shown = new constructor(title, { body, tag: notice.noticeId });
    shown.onclick = (): void => {
      window.focus();
      shown.close();
      onOpen(notice);
    };
  } catch {
    return;
  }
}
