// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react';

export type CarriedTimeframe = {
  readonly timeframe: string | undefined;
  readonly carry: (timeframe: string | undefined) => void;
};

const NOTHING_CARRIED: CarriedTimeframe = { timeframe: undefined, carry: () => undefined };

const CarriedTimeframeContext = createContext<CarriedTimeframe>(NOTHING_CARRIED);

// A vela que a pessoa escolheu no gráfico acompanha a troca rápida de execução enquanto ela fica no detalhe; ao sair da
// tela, some (cada execução volta a abrir na sua vela, RF05). Sem provedor, nada é levado adiante.
export function CarriedTimeframeProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const [timeframe, carry] = useState<string | undefined>(undefined);
  return (
    <CarriedTimeframeContext.Provider value={{ timeframe, carry }}>
      {children}
    </CarriedTimeframeContext.Provider>
  );
}

export function useCarriedTimeframe(): CarriedTimeframe {
  return useContext(CarriedTimeframeContext);
}
