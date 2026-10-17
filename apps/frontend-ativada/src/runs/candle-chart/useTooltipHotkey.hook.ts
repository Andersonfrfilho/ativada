// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

// `V` liga e desliga o balão de valores, desde que o foco não esteja num campo e nenhuma outra tecla de atalho esteja apertada.
export function useTooltipHotkey(toggle: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'v') return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return (): void => document.removeEventListener('keydown', onKey);
  }, [toggle]);
}
