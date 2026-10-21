// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, useState } from 'react';

type LifetimeParams = {
  readonly milliseconds: number;
  // Muda quando a ordem troca de estado: os 8 s recomeçam.
  readonly version: number;
  // Ordem ainda pedida: o aviso fica até ela mudar de estado.
  readonly isPending: boolean;
  readonly onExpire: () => void;
};

export type HoldHandlers = {
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
};

// RF07: o aviso some sozinho em 8 s e pausa enquanto o mouse está em cima ou o foco está dentro; sumir não marca como lido.
export function useToastLifetime(params: LifetimeParams): HoldHandlers {
  const { milliseconds, version, isPending, onExpire } = params;
  const [isHeld, setIsHeld] = useState(false);
  const isPaused = isHeld || isPending;
  const expireReference = useRef(onExpire);
  expireReference.current = onExpire;
  useEffect(() => {
    if (isPaused) return undefined;
    const timer = setTimeout(() => expireReference.current(), milliseconds);
    return (): void => clearTimeout(timer);
  }, [milliseconds, version, isPaused]);
  return {
    onMouseEnter: (): void => setIsHeld(true),
    onMouseLeave: (): void => setIsHeld(false),
    onFocus: (): void => setIsHeld(true),
    onBlur: (): void => setIsHeld(false),
  };
}
