// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SIMULATION_TIMEFRAME = {
  QUARTER_HOUR: '15m',
  HOUR: '1h',
  FOUR_HOURS: '4h',
  DAY: '1d',
} as const;

export type SimulationTimeframe = (typeof SIMULATION_TIMEFRAME)[keyof typeof SIMULATION_TIMEFRAME];

// D1 da spec 006: a primeira decisão chega em até 1 hora.
export const DEFAULT_SIMULATION_TIMEFRAME: SimulationTimeframe = SIMULATION_TIMEFRAME.HOUR;

export const SIMULATION_TIMEFRAME_OPTIONS: readonly SimulationTimeframe[] = [
  SIMULATION_TIMEFRAME.HOUR,
  SIMULATION_TIMEFRAME.FOUR_HOURS,
  SIMULATION_TIMEFRAME.DAY,
];

// D2: a vela de 15 minutos fica escondida em "Mais opções".
export const HIDDEN_SIMULATION_TIMEFRAME_OPTIONS: readonly SimulationTimeframe[] = [
  SIMULATION_TIMEFRAME.QUARTER_HOUR,
];

export const SIMULATION_TIMEFRAME_LABEL: Readonly<Record<SimulationTimeframe, string>> = {
  '15m': '15 minutos',
  '1h': '1 hora',
  '4h': '4 horas',
  '1d': '1 dia',
};

export const SIMULATION_EVERY_TEXT: Readonly<Record<SimulationTimeframe, string>> = {
  '15m': 'a cada 15 minutos',
  '1h': 'a cada 1 hora',
  '4h': 'a cada 4 horas',
  '1d': 'uma vez por dia',
};

// A frase do 1d depende do fuso do usuário e é montada por `describeFrequency`.
export const SIMULATION_FREQUENCY_TEXT: Readonly<Record<string, string>> = {
  '15m': 'A cada 15 minutos: até 96 decisões por dia.',
  '1h': 'A cada 1 hora: até 24 decisões por dia.',
  '4h': 'A cada 4 horas: até 6 por dia.',
};

export const RANKING_TIMEFRAME_NOTICE =
  'O ranking desta meta é calculado com velas diárias. Simular com velas menores é um teste ao vivo: o resultado pode ser diferente e não muda o ranking.';

export const SMALL_CANDLE_FEES_NOTICE =
  'Com velas de 15 min a estratégia opera mais vezes e as taxas pesam mais.';

export const SIMULATION_PICKER_LEGEND = 'De quanto em quanto tempo olhar o mercado';

export const LIVE_RUN_LIMIT = 5;
export const LIVE_RUN_LIMIT_TEXT = `Você chegou ao limite de ${LIVE_RUN_LIMIT} simulações ao vivo. Pare uma para começar outra.`;

export const DUPLICATE_RUN_TEXT = 'Você já tem esta simulação rodando.';

export function isSimulationTimeframe(value: string): value is SimulationTimeframe {
  return Object.values<string>(SIMULATION_TIMEFRAME).includes(value);
}
