// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { BalconySlot } from './balcony.constant.js';

export type LeaderFocus = {
  readonly slot: BalconySlot;
  // O balão do agente em foco: de onde a linha sai.
  readonly element: HTMLElement;
};

export type LeaderControls = {
  readonly focus: LeaderFocus | undefined;
  readonly setFocus: (focus: LeaderFocus | undefined) => void;
};

const LeaderContext = createContext<LeaderControls | undefined>(undefined);

// A ponte entre a varanda e o gráfico: quem comenta o quê, para a linha tracejada ligar o balão ao ponto. Sem provedor, nada liga.
export function LeaderFocusProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [focus, setFocus] = useState<LeaderFocus | undefined>(undefined);
  const value = useMemo(() => ({ focus, setFocus }), [focus]);
  return <LeaderContext.Provider value={value}>{children}</LeaderContext.Provider>;
}

export function useLeaderFocus(): LeaderControls | undefined {
  return useContext(LeaderContext);
}
