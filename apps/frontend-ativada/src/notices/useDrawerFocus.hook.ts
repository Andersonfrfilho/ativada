// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input, summary, [tabindex]:not([tabindex="-1"])';

export type DrawerFocus = {
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function cycleFocus(event: KeyboardEvent<HTMLDivElement>, container: HTMLDivElement | null): void {
  if (container === null) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// RF09: o foco vai para o título ao abrir, fica preso dentro (Tab em ciclo), Esc fecha e o foco volta a quem abriu (o sino).
export function useDrawerFocus(onClose: () => void): DrawerFocus {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement;
    titleRef.current?.focus();
    return (): void => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') cycleFocus(event, containerRef.current);
  }
  return { titleRef, containerRef, handleKeyDown };
}
