// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

// Recebe o instante de abertura da vela que o gráfico aponta (mouse ou teclado); `undefined` é "agora".
export type TeamAsideRenderer = (pointedOpenTime: number | undefined) => ReactElement;

const TeamAsideContext = createContext<TeamAsideRenderer | undefined>(undefined);

// A equipe compacta que o gráfico mostra colada nele; sem provedor (ou na sala), nada aparece.
export function TeamAsideProvider({
  aside,
  children,
}: {
  readonly aside: TeamAsideRenderer | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return <TeamAsideContext.Provider value={aside}>{children}</TeamAsideContext.Provider>;
}

// Quem desenha o gráfico precisa saber se há equipe para reservar a coluna ao lado dele.
export function useHasTeamAside(): boolean {
  return useContext(TeamAsideContext) !== undefined;
}

export function TeamAside({
  pointedOpenTime,
}: {
  readonly pointedOpenTime: number | undefined;
}): ReactElement | null {
  const render = useContext(TeamAsideContext);
  return render === undefined ? null : render(pointedOpenTime);
}
