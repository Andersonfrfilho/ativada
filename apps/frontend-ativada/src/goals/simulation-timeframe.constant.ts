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

// O analista de risco (spec 007): só existe com a vela de 15 min, em sombra (padrão) ou governando; os 0,30% são a taxa e o deslizamento padrão de
// uma ida e volta (0,10% e 0,05% de cada lado). Tudo é texto fixo: o painel não calcula nada.
export const ANALYST_MODE = { SHADOW: 'shadow', GOVERN: 'govern' } as const;
export type AnalystMode = (typeof ANALYST_MODE)[keyof typeof ANALYST_MODE];

export const ANALYST_OPTION_LABEL = 'Deixar o analista de risco decidir';
export const ANALYST_LOCKED_TIMEFRAME_NOTICE =
  'A vela fica travada em 15 minutos: o analista olha o mercado a cada vela de 15 minutos.';
export const ANALYST_ROUND_TRIP_FEE_NOTICE =
  'Cada ida e volta (compra e venda) custa 0,30% do valor, entre taxa e deslizamento. O analista só libera uma entrada quando o movimento típico paga pelo menos o dobro disso.';
export const ANALYST_SHADOW_NOTICE =
  'Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança.';
export const ANALYST_GOVERN_NOTICE =
  'Governar: o analista pode pausar as entradas, reduzir o tamanho da entrada (¼, ½ ou 1× do que a estratégia arriscaria) e sair por tempo. A saída por proteção (stop) nunca é bloqueada. É sempre dinheiro fictício.';
export const ANALYST_MODE_LEGEND = 'O que o analista faz';
export const ANALYST_MODE_LABEL = {
  shadow: 'Só observar (sombra)',
  govern: 'Decidir de verdade (governar)',
} as const;
export const ANALYST_MODE_HINT = {
  shadow: 'Mostra o que ele faria; a simulação segue a estratégia sem mudança.',
  govern: 'A simulação passa a obedecer ao analista.',
} as const;

// O teto de verdade vem de `GET /v1/me` (`limits.maxActiveLivePaperRuns`); este é o padrão do servidor, usado enquanto o perfil não chega.
export const DEFAULT_LIVE_RUN_LIMIT = 5;

export function buildLiveRunLimitText(limit: number): string {
  return `Você chegou ao limite de ${limit} simulações ao vivo. Pare uma para começar outra.`;
}

// A resposta 409 da API não diz o teto do usuário: o texto não repete o número.
export const LIVE_RUN_LIMIT_REACHED_TEXT =
  'Você chegou ao limite de simulações ao vivo. Pare uma para começar outra.';

export const DUPLICATE_RUN_TEXT = 'Você já tem esta simulação rodando.';

export function isSimulationTimeframe(value: string): value is SimulationTimeframe {
  return Object.values<string>(SIMULATION_TIMEFRAME).includes(value);
}
