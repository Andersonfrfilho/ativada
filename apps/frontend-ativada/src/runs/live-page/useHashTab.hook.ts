// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { LIVE_TAB, tabOfHash, type LiveTab } from './live-tabs.js';

// A aba aberta: a do endereço (`#acompanhamento`, `#decisoes`...) ou "Operações". Um link para a âncora, mesmo dentro da
// página, troca a aba e leva até ela.
export function useHashTab(): readonly [LiveTab, (tab: LiveTab) => void] {
  const { hash } = useLocation();
  const fromHash = tabOfHash(hash);
  const [tab, setTab] = useState<LiveTab>(fromHash ?? LIVE_TAB.OPERATIONS);
  const [seenHash, setSeenHash] = useState(hash);
  if (hash !== seenHash) {
    setSeenHash(hash);
    if (fromHash !== undefined) setTab(fromHash);
  }
  useEffect(() => {
    if (fromHash === undefined) return;
    globalThis.requestAnimationFrame?.(() => document.getElementById(fromHash)?.scrollIntoView?.());
  }, [fromHash]);
  return [tab, setTab];
}
