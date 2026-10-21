// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describeZone, formatRelativeMoment, type MomentContext } from '../format/zoned-moment.js';
import { formatTimeInZone } from '../format/zoned-time.js';
import { nextCandleClose } from './next-candle-close.js';
import {
  SIMULATION_EVERY_TEXT,
  SIMULATION_FREQUENCY_TEXT,
  SIMULATION_TIMEFRAME,
  type SimulationTimeframe,
} from './simulation-timeframe.constant.js';

// RF02: "A cada 1 hora: até 24 decisões por dia." e, na vela diária, o horário do fechamento no fuso do usuário.
export function describeFrequency(timeframe: SimulationTimeframe, context: MomentContext): string {
  if (timeframe !== SIMULATION_TIMEFRAME.DAY) return SIMULATION_FREQUENCY_TEXT[timeframe] ?? '';
  const closeAt = nextCandleClose({ timeframe, now: context.now });
  const time = formatTimeInZone(closeAt, context.timeZone);
  return `Uma vez por dia, às ${time} (${describeZone(context.timeZone, closeAt)}).`;
}

// "A simulação olha o mercado a cada 1 hora. Primeira vela fecha às 15:00 de hoje (horário de Brasília)."
export function describeSimulationSummary(
  timeframe: SimulationTimeframe,
  context: MomentContext,
): string {
  const closeAt = nextCandleClose({ timeframe, now: context.now });
  const when = formatRelativeMoment(closeAt, context);
  return (
    `A simulação olha o mercado ${SIMULATION_EVERY_TEXT[timeframe]}. ` +
    `Primeira vela fecha às ${when} (${describeZone(context.timeZone, closeAt)}).`
  );
}
