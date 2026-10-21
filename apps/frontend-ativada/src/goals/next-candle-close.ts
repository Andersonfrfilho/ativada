// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SIMULATION_TIMEFRAME, type SimulationTimeframe } from './simulation-timeframe.constant.js';

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const QUARTER_HOUR_MINUTES = 15;
const FOUR_HOURS = 4;

export const CANDLE_DURATION_MILLISECONDS: Readonly<Record<SimulationTimeframe, number>> = {
  [SIMULATION_TIMEFRAME.QUARTER_HOUR]: QUARTER_HOUR_MINUTES * MILLISECONDS_PER_MINUTE,
  [SIMULATION_TIMEFRAME.HOUR]: MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE,
  [SIMULATION_TIMEFRAME.FOUR_HOURS]: FOUR_HOURS * MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE,
  [SIMULATION_TIMEFRAME.DAY]: HOURS_PER_DAY * MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE,
};

export type CandleCloseParams = {
  readonly timeframe: SimulationTimeframe;
  // Instante em ms UTC; sem relógio global para o teste não depender da hora de hoje.
  readonly now: number;
};

// As velas se alinham à época UTC (a diária fecha às 00:00 UTC). No instante exato de um fechamento
// nasce a vela seguinte, então o fim da vela em curso é o próximo.
export function nextCandleClose({ timeframe, now }: CandleCloseParams): number {
  const duration = CANDLE_DURATION_MILLISECONDS[timeframe];
  return (Math.floor(now / duration) + 1) * duration;
}
