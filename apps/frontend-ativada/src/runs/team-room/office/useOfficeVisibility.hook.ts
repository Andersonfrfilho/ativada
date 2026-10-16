// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';

export type OfficeVisibility = {
  // Ref de função: o escritório só existe com o cartão aberto, e o observador liga quando ele aparece.
  readonly ref: (node: HTMLDivElement | null) => void;
  readonly isAutoPaused: boolean;
};

// Verdadeiro quando a coreografia deve esperar: o escritório saiu da tela (IntersectionObserver) ou a aba ficou oculta.
// Sem IntersectionObserver (ambiente sem ele) o escritório conta como visível.
export function useOfficeVisibility(): OfficeVisibility {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [isOffscreen, setIsOffscreen] = useState(false);
  const [isHidden, setIsHidden] = useState(() => document.visibilityState === 'hidden');
  useEffect(() => {
    if (element === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry !== undefined) setIsOffscreen(!entry.isIntersecting);
    });
    observer.observe(element);
    return (): void => observer.disconnect();
  }, [element]);
  useEffect(() => {
    const handleChange = (): void => setIsHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', handleChange);
    return (): void => document.removeEventListener('visibilitychange', handleChange);
  }, []);
  return { ref: setElement, isAutoPaused: isOffscreen || isHidden };
}
