// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useRef, useState, type RefObject, type UIEvent } from 'react';

import {
  computeVisibleRows,
  ROW_HEIGHT,
  ROW_OVERSCAN,
  scrollTopToReveal,
  TABLE_VIEWPORT_HEIGHT,
  type VisibleRows,
} from './virtual-rows.js';

export type VirtualRows = {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly visible: VisibleRows;
  readonly handleScroll: (event: UIEvent<HTMLDivElement>) => void;
  // Rola o contêiner até a linha (se ela já não estiver folgada à vista).
  readonly reveal: (index: number) => void;
};

// A janela virtual acompanha a rolagem do contêiner; o React só desenha as linhas visíveis.
export function useVirtualRows(total: number): VirtualRows {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const visible = computeVisibleRows({
    rowHeight: ROW_HEIGHT,
    viewportHeight: TABLE_VIEWPORT_HEIGHT,
    scrollTop,
    total,
    overscan: ROW_OVERSCAN,
  });
  return {
    containerRef,
    visible,
    handleScroll: (event): void => setScrollTop(event.currentTarget.scrollTop),
    reveal: (index): void => {
      const target = scrollTopToReveal({
        index,
        scrollTop,
        rowHeight: ROW_HEIGHT,
        viewportHeight: TABLE_VIEWPORT_HEIGHT,
      });
      if (target === undefined) return;
      if (containerRef.current !== null) containerRef.current.scrollTop = target;
      setScrollTop(target);
    },
  };
}
