// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState, type RefObject } from 'react';

const ESCAPE_KEY = 'Escape';

export type BadgeSheet = {
  readonly isOpen: boolean;
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly toggle: () => void;
};

// A ficha do crachá abre por clique, Enter ou toque; Esc ou clique fora fecham e o foco volta ao crachá.
export function useBadgeSheet(): BadgeSheet {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== ESCAPE_KEY) return;
      setIsOpen(false);
      buttonRef.current?.focus();
    }
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return;
      setIsOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);
  return { isOpen, rootRef, buttonRef, toggle: () => setIsOpen((previous) => !previous) };
}
