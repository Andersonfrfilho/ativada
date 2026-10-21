// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';

import type { SurfacePriceLevel } from './chart-surface.types.js';

export type PointedRole = SurfacePriceLevel['role'] | undefined;
type PointedLevel = { readonly role: PointedRole; readonly setRole: (role: PointedRole) => void };

const PointedLevelContext = createContext<PointedLevel>({
  role: undefined,
  setRole: () => undefined,
});

// O nível do plano que o agente aponta no telão da sala: o piso escreve, o gráfico engrossa aquela linha.
export function PointedLevelProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [role, setRole] = useState<PointedRole>(undefined);
  return (
    <PointedLevelContext.Provider value={{ role, setRole }}>
      {children}
    </PointedLevelContext.Provider>
  );
}

export function usePointedLevel(): PointedLevel {
  return useContext(PointedLevelContext);
}
