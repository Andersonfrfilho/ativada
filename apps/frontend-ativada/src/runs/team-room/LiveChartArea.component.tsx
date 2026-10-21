// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { TradeChartCard } from '../TradeChartCard.component.js';
import { TerminalScreen } from '../trading-room/TerminalScreen.component.js';
import { TradingRoom } from '../trading-room/TradingRoom.component.js';

export type LiveChartAreaProps = {
  readonly runId: string;
  readonly symbol: string;
  readonly timeframe: string;
  // Sem gráfico (simulação concluída) a sala aparece sem o telão.
  readonly hasChart: boolean;
};

// A simulação ao vivo abre na sala de operações (spec 011, Fase 3): o gráfico de produção é o telão da parede e a equipe
// trabalha no piso, logo abaixo; nada da equipe fica sobre as velas.
export function LiveChartArea({
  runId,
  symbol,
  timeframe,
  hasChart,
}: LiveChartAreaProps): ReactElement {
  const screen = hasChart ? (
    <TerminalScreen symbol={symbol} timeframe={timeframe}>
      <TradeChartCard runId={runId} hasSummary={false} hasProjections={false} />
    </TerminalScreen>
  ) : undefined;
  return <TradingRoom runId={runId} screen={screen} />;
}
