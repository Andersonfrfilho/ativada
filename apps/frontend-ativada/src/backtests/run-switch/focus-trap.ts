// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), a[href]';

// Dentro da folha de busca o Tab dá a volta: o foco nunca escapa para a página que está atrás dela.
export function trapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  const isLeavingBackwards = event.shiftKey && document.activeElement === first;
  const isLeavingForwards = !event.shiftKey && document.activeElement === last;
  if (!isLeavingBackwards && !isLeavingForwards) return;
  event.preventDefault();
  (isLeavingBackwards ? last : first).focus();
}
