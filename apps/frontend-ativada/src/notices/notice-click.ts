// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MouseEvent } from 'react';

const INTERACTIVE = 'a, button, summary, details, input, select, textarea, label';

// O clique no corpo do aviso abre a tela; o que já tem ação própria (link, botão, detalhe) fica como está.
export function isBodyClick(event: MouseEvent): boolean {
  return !(event.target instanceof Element && event.target.closest(INTERACTIVE) !== null);
}

// Clique simples no link: o aviso cuida de navegar e marcar como lido; Ctrl/Cmd/Shift deixam o navegador agir.
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
