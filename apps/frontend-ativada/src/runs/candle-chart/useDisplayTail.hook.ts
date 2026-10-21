// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useClock } from '../../live/useClock.hook.js';
import type { TradeChart } from '../trade-chart.validation.js';
import { bucketOf, type DisplayMapping } from './display-mapping.js';

const CLOCK_MILLISECONDS = 10_000;
// O worker grava a vela de exibição um instante depois de ela fechar: pedir antes disso traria a página sem ela.
const STORE_GRACE_MILLISECONDS = 15_000;

export type DisplayTailParams = {
  readonly chart: TradeChart;
  readonly mapping: DisplayMapping | undefined;
  // O gráfico acompanha o fim da simulação ao vivo (sem faixa na URL).
  readonly isFollowing: boolean;
};

// O período da execução só avança a cada vela de 15 min, mas a vela de 3 min fecha a cada 3: acompanhando o fim, a ponta da
// série anda com o relógio, sem passar do fim da vela de 15 min em curso. Fora disso, o período da execução como veio.
export function useDisplayTail({ chart, mapping, isFollowing }: DisplayTailParams): {
  readonly from: number;
  readonly to: number;
} {
  const now = useClock(CLOCK_MILLISECONDS);
  const { from, to } = chart.runRange;
  if (mapping === undefined || !isFollowing) return { from, to };
  const closedUntil = bucketOf(now - STORE_GRACE_MILLISECONDS, mapping.displayMilliseconds);
  return { from, to: Math.max(to, Math.min(closedUntil, to + mapping.runMilliseconds)) };
}
