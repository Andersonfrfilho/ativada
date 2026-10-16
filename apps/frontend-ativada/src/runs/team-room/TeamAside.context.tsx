// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

const TeamAsideContext = createContext<ReactElement | undefined>(undefined);

// A equipe compacta que o gráfico mostra ao lado de "Próxima vela de perto"; sem provedor (ou na sala), nada aparece.
export function TeamAsideProvider({
  aside,
  children,
}: {
  readonly aside: ReactElement | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return <TeamAsideContext.Provider value={aside}>{children}</TeamAsideContext.Provider>;
}

export function TeamAside(): ReactElement | null {
  return useContext(TeamAsideContext) ?? null;
}
