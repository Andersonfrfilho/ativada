// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

const TerminalChartContext = createContext(false);

// O gráfico dentro do telão da sala de operações (spec 011, Fase 3): liga as médias MA20/MA50 e os níveis do plano do
// servidor. Fora dele (backtest, walk-forward) o gráfico segue como era.
export function TerminalChartProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <TerminalChartContext.Provider value>{children}</TerminalChartContext.Provider>;
}

export function useIsTerminalChart(): boolean {
  return useContext(TerminalChartContext);
}
