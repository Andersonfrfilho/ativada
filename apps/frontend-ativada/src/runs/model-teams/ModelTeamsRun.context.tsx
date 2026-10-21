// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

// De qual execução são os ◆ da tela: a varanda, o escritório e a lista de crachás pedem as equipes da MESMA simulação,
// sem cada um receber o `runId` por propriedade.
const ModelTeamsRunContext = createContext<string | undefined>(undefined);

export type ModelTeamsRunProviderProps = {
  readonly runId: string;
  readonly children: ReactNode;
};

export function ModelTeamsRunProvider({
  runId,
  children,
}: ModelTeamsRunProviderProps): ReactElement {
  return <ModelTeamsRunContext.Provider value={runId}>{children}</ModelTeamsRunContext.Provider>;
}

export function useModelTeamsRunId(): string | undefined {
  return useContext(ModelTeamsRunContext);
}
