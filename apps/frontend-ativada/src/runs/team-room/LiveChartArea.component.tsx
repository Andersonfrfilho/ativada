// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { TeamComparison } from '../model-teams/TeamComparison.component.js';
import { ProjectionCards } from '../projection-cards/ProjectionCards.component.js';
import { TradeChartCard } from '../TradeChartCard.component.js';
import { TerminalScreen } from '../trading-room/TerminalScreen.component.js';
import { TradingRoom } from '../trading-room/TradingRoom.component.js';

export type LiveChartAreaProps = {
  readonly runId: string;
  readonly symbol: string;
  readonly timeframe: string;
  // Sem gráfico (simulação concluída) a sala aparece sem o telão.
  readonly hasChart: boolean;
  // O que vem depois da sala: as decisões e o acompanhamento detalhado.
  readonly children?: ReactNode;
};

// A simulação ao vivo abre na sala de operações (spec 011, Fase 3): o gráfico de produção é o telão da parede e a equipe
// trabalha no piso, abaixo dele; nada da equipe fica sobre as velas.
export function LiveChartArea({
  runId,
  symbol,
  timeframe,
  hasChart,
  children,
}: LiveChartAreaProps): ReactElement {
  const screen = hasChart ? (
    <TerminalScreen symbol={symbol} timeframe={timeframe}>
      <TradeChartCard runId={runId} hasSummary={false} hasProjections={false} />
    </TerminalScreen>
  ) : undefined;
  return (
    <>
      <TradingRoom runId={runId} screen={screen} />
      {children}
      {hasChart ? <ProjectionCards runId={runId} isLive /> : null}
      <TeamComparison runId={runId} />
    </>
  );
}
