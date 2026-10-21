// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type MouseEventHandler,
  type PointerEventHandler,
  type RefObject,
} from 'react';

const ESCAPE_KEY = 'Escape';

export type TermDisclosure = {
  readonly isOpen: boolean;
  readonly rootRef: RefObject<HTMLSpanElement | null>;
  readonly buttonProps: {
    readonly onClick: MouseEventHandler<HTMLButtonElement>;
    readonly onFocus: FocusEventHandler<HTMLButtonElement>;
    readonly onBlur: FocusEventHandler<HTMLButtonElement>;
    readonly onPointerDown: PointerEventHandler<HTMLButtonElement>;
  };
};

// Foco de teclado abre; clique e toque alternam (o foco que o ponteiro causa não abre antes do clique, senão o clique fecharia).
export function useTermDisclosure(): TermDisclosure {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const isPointerPress = useRef(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === ESCAPE_KEY) setIsOpen(false);
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

  return {
    isOpen,
    rootRef,
    buttonProps: {
      onPointerDown: (): void => {
        isPointerPress.current = true;
      },
      onFocus: (): void => {
        if (!isPointerPress.current) setIsOpen(true);
      },
      onBlur: (): void => setIsOpen(false),
      onClick: (): void => {
        isPointerPress.current = false;
        setIsOpen((previous) => !previous);
      },
    },
  };
}
