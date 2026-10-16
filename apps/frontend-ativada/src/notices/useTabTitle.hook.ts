// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import { APP_NAME } from '../app/app.constant.js';

const ICON_SELECTOR = 'link[rel="icon"]';
const DOT_ICON = { href: '/icon-dot.svg', type: 'image/svg+xml' } as const;

// Troca o ícone da aba pela variante com o ponto (pronta em public/, sem desenhar em canvas) e devolve o de sempre.
function useTabIcon(hasDot: boolean): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>(ICON_SELECTOR);
    if (link === null || !hasDot) return undefined;
    const original = {
      href: link.getAttribute('href') ?? '',
      type: link.getAttribute('type') ?? '',
    };
    link.setAttribute('href', DOT_ICON.href);
    link.setAttribute('type', DOT_ICON.type);
    return (): void => {
      link.setAttribute('href', original.href);
      link.setAttribute('type', original.type);
    };
  }, [hasDot]);
}

// RF12: com a aba escondida o título vira "(2) AtivAdA" com os avisos não lidos e o ícone ganha um ponto; ao voltar, o de sempre.
export function useTabTitle(params: {
  readonly unreadCount: number;
  readonly isHidden: boolean;
}): void {
  const { unreadCount, isHidden } = params;
  const hasUnread = isHidden && unreadCount > 0;
  useEffect(() => {
    const original = document.title;
    if (hasUnread) document.title = `(${unreadCount}) ${APP_NAME}`;
    return (): void => {
      document.title = original;
    };
  }, [unreadCount, hasUnread]);
  useTabIcon(hasUnread);
}
