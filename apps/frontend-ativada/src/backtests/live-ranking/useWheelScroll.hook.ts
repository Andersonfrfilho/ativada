// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useRef, type RefObject } from 'react';

// A fileira não mostra barra de rolagem: a roda do mouse (vertical) passa a rolar para o lado enquanto houver para onde ir.
export function useWheelScroll<TElement extends HTMLElement>(
  isMounted: boolean,
): RefObject<TElement | null> {
  const ref = useRef<TElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    function handleWheel(event: WheelEvent): void {
      if (element === null || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const room = element.scrollWidth - element.clientWidth;
      const isAtEdge =
        (event.deltaY < 0 && element.scrollLeft <= 0) ||
        (event.deltaY > 0 && element.scrollLeft >= room);
      if (room <= 0 || isAtEdge) return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    }
    element.addEventListener('wheel', handleWheel, { passive: false });
    return (): void => element.removeEventListener('wheel', handleWheel);
  }, [isMounted]);
  return ref;
}
