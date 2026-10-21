// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect } from 'react';

import { SWITCH_SHORTCUT_NEXT, SWITCH_SHORTCUT_PREVIOUS } from './run-switch.constant.js';

export type SwitchShortcutHandlers = {
  readonly isEnabled: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
};

// Quem está digitando, ou usando uma lista aberta, não perde a tecla: `[` e `]` só valem com o foco fora de um campo.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useSwitchShortcuts({
  isEnabled,
  onPrevious,
  onNext,
}: SwitchShortcutHandlers): void {
  useEffect(() => {
    if (!isEnabled) return undefined;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === SWITCH_SHORTCUT_PREVIOUS) onPrevious();
      else if (event.key === SWITCH_SHORTCUT_NEXT) onNext();
    }
    document.addEventListener('keydown', handleKeyDown);
    return (): void => document.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled, onPrevious, onNext]);
}
