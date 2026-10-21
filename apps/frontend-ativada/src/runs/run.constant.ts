// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RUN_KIND = {
  BACKTEST: 'backtest',
  WALK_FORWARD: 'walk_forward',
  LIVE_PAPER: 'live_paper',
} as const;

export type RunKind = (typeof RUN_KIND)[keyof typeof RUN_KIND];

export const RUN_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const;

export const RUN_POLL_MILLISECONDS = 2_000;
// Simulação ao vivo rodando: o WebSocket invalida o detalhe, então a consulta periódica é só rede de segurança.
export const LIVE_RUN_POLL_MILLISECONDS = 60_000;
export const LIST_PAGE_SIZE = 20;
export const CURVE_MAX_POINTS = 240;

const STATUS_LABEL: Readonly<Record<string, string>> = {
  [RUN_STATUS.QUEUED]: 'Na fila',
  [RUN_STATUS.RUNNING]: 'Rodando',
  [RUN_STATUS.COMPLETED]: 'Concluída',
  [RUN_STATUS.FAILED]: 'Falhou',
  [RUN_STATUS.CANCELLED]: 'Cancelada',
};

// Status que este painel não conhece aparece como veio, sem derrubar a tela.
export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export const FAILURE_TEXT: Readonly<Record<string, string>> = {
  NO_CANDLES: 'Não há velas gravadas para esse par, timeframe e período.',
  INSUFFICIENT_HISTORY:
    'O período começa cedo demais: falta histórico para aquecer os indicadores.',
  BACKTEST_TIMEOUT: 'A execução demorou mais que o limite e foi encerrada.',
  WORKER_CRASHED: 'O processo que rodava a execução caiu. Tente de novo.',
  DISPATCH_FAILED: 'A execução não pôde ser entregue ao executor. Tente de novo.',
  HASH_MISMATCH: 'A estratégia ou os parâmetros mudaram desde o pedido. Crie a execução de novo.',
};

export const METRIC_UNAVAILABLE_TEXT: Readonly<Record<string, string>> = {
  no_equity_points: 'sem pontos de patrimônio',
  insufficient_returns: 'poucos retornos para calcular',
  zero_volatility: 'sem oscilação',
  zero_downside: 'sem queda',
  period_too_short: 'período curto demais',
  no_trades: 'sem operações',
  no_losses: 'sem perdas',
  no_wins: 'sem ganhos',
};

// Os cinco motivos reais do motor (ADR 0002, spec 005 O12), em português simples.
export const EXIT_REASON_PLAIN_TEXT: Readonly<Record<string, string>> = {
  target: 'atingiu o alvo de lucro',
  stop: 'vendeu para limitar a perda (stop)',
  signal: 'a estratégia mandou vender',
  command: 'a meta chegou ao fim e a simulação vendeu',
  gap: 'faltaram dados do mercado e a posição foi fechada',
};

// Motivo que este painel não conhece aparece como veio, nunca some.
export function exitReasonText(code: string): string {
  return EXIT_REASON_PLAIN_TEXT[code] ?? code;
}
