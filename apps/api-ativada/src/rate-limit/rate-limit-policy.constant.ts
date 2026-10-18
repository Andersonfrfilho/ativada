// Copyright (c) 2026 Ada Technology. All rights reserved.
export const RATE_LIMIT_KEY_SCOPE = {
  SUBJECT: 'subject',
  CLIENT_ADDRESS: 'client-address',
} as const;

export type RateLimitKeyScope = (typeof RATE_LIMIT_KEY_SCOPE)[keyof typeof RATE_LIMIT_KEY_SCOPE];

export type RateLimitPolicy = {
  readonly name: string;
  readonly limit: number;
  readonly windowMilliseconds: number;
  readonly keyScope: RateLimitKeyScope;
  readonly maxTrackedKeys: number;
};

const ONE_MINUTE_MILLISECONDS = 60_000;
const ONE_HOUR_MILLISECONDS = 3_600_000;
const DEFAULT_MAX_TRACKED_KEYS = 10_000;

export const RATE_LIMIT_POLICY = {
  ACCOUNT_EXPORT: {
    name: 'account-export',
    limit: 1,
    windowMilliseconds: ONE_HOUR_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  AUTHENTICATED_USER: {
    name: 'authenticated-user',
    limit: 120,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  EXECUTION_CREATION: {
    name: 'execution-creation',
    limit: 20,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  CANDLE_QUERY: {
    name: 'candle-query',
    limit: 60,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  GOAL_EVALUATION: {
    name: 'goal-evaluation',
    limit: 20,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // Só a avaliação a FRIO (cache que erra) e o PATCH de meta que muda alvo, prazo ou perda gastam este orçamento: é o que custa CPU.
  GOAL_EVALUATION_COLD: {
    name: 'goal-evaluation-cold',
    limit: 3,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // Criar, alterar e apagar alertas de preço: religar em laço rearma o alerta e gera aviso (Telegram) a cada ciclo.
  PRICE_ALERT_MUTATION: {
    name: 'price-alert-mutation',
    limit: 10,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // O aviso do WebSocket refaz a lista de avisos (e o resumo ao voltar à aba) a cada passo de vela: 60 por minuto, uma consulta cada.
  NOTICES: {
    name: 'notices',
    limit: 60,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  RUN_EXPORT: {
    name: 'run-export',
    limit: 10,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // O gráfico lê preço e preenchimentos da execução em SQL (colunas mín-máx e agrupamentos): o painel pede no máximo uma sonda e uma faixa por gesto.
  RUN_CHART: {
    name: 'run-chart',
    limit: 30,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // O aviso do WebSocket refaz o acompanhamento a cada vela e cada refeita lê 4 ou 5 consultas por chave: 60 por minuto sobram.
  RUN_LIVE_STATUS: {
    name: 'run-live-status',
    limit: 60,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // A Visão geral refaz o resumo de todas as simulações a cada aviso do stream: uma consulta só, 60 por minuto sobram.
  RUN_LIVE_SUMMARY: {
    name: 'run-live-summary',
    limit: 60,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  RUN_TRADE_SUMMARY: {
    name: 'run-trade-summary',
    limit: 30,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // Equipes de modelo (spec 015): o painel refaz o estado a cada aviso do stream e a cada 2 s enquanto há pedido avulso pendente.
  MODEL_TEAMS_READ: {
    name: 'model-teams-read',
    limit: 60,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // Cada pedido avulso custa uma chamada ao provedor: 5 por 10 minutos, além do teto diário por usuário.
  MODEL_OPINION_REQUEST: {
    name: 'model-opinion-request',
    limit: 5,
    windowMilliseconds: 10 * ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  // O duelo cria várias simulações de uma vez.
  MODEL_DUEL_CREATE: {
    name: 'model-duel-create',
    limit: 3,
    windowMilliseconds: ONE_HOUR_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  ADMIN_INVITATION: {
    name: 'admin-invitation',
    limit: 10,
    windowMilliseconds: ONE_HOUR_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  SESSION_CLIENT_ADDRESS: {
    name: 'session-client-address',
    limit: 10,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  STREAM_TICKET_CLIENT_ADDRESS: {
    name: 'stream-ticket-client-address',
    limit: 10,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  STREAM_UPGRADE_CLIENT_ADDRESS: {
    name: 'stream-upgrade-client-address',
    limit: 30,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  TELEGRAM_LINK_CODE_ISSUE: {
    name: 'telegram-link-code-issue',
    limit: 10,
    windowMilliseconds: ONE_HOUR_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.SUBJECT,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  TELEGRAM_WEBHOOK_CLIENT_ADDRESS: {
    name: 'telegram-webhook-client-address',
    limit: 300,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  HEALTH_CLIENT_ADDRESS: {
    name: 'health-client-address',
    limit: 600,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
  UNAUTHENTICATED_CLIENT_ADDRESS: {
    name: 'unauthenticated-client-address',
    limit: 30,
    windowMilliseconds: ONE_MINUTE_MILLISECONDS,
    keyScope: RATE_LIMIT_KEY_SCOPE.CLIENT_ADDRESS,
    maxTrackedKeys: DEFAULT_MAX_TRACKED_KEYS,
  },
} as const satisfies Readonly<Record<string, RateLimitPolicy>>;

export const RATE_LIMIT_CHARGE = {
  BEFORE_HANDLER: 'before-handler',
  AFTER_SUCCESS: 'after-success',
} as const;

export type RateLimitCharge = (typeof RATE_LIMIT_CHARGE)[keyof typeof RATE_LIMIT_CHARGE];

export const UNKNOWN_CLIENT_ADDRESS = 'unknown';
