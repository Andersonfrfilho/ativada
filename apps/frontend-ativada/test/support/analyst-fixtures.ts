// Copyright (c) 2026 Ada Technology. All rights reserved.
import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './fake-fetch.js';
import { FIXTURE_CANDLE_TIME } from './live-status-fixtures.js';
import { LIVE_BASE } from './live-tracking-harness.js';

export const QUARTER_HOUR = 900_000;
export const ANALYST_DISCLAIMER =
  'O analista é uma regra automática sobre dados passados; não é recomendação. Tendência, não promessa. Tudo simulado, com dinheiro fictício.';
export const SHADOW_MODE_MESSAGE =
  'Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança.';
export const MOVE_COST_REASON =
  'O movimento típico de 15 min (0,22%) não paga com folga a ida e volta das taxas (0,30%): precisa ser pelo menos o dobro.';
export const PAUSE_LINE =
  'Postura agora: PAUSA · nenhuma entrada nova; as saídas da estratégia continuam valendo.';

const LOCK_LINES = [
  'Perda das últimas 24 h: 0,00% de 1% permitido',
  'Perdas seguidas: 0 de 3',
  'Operações nas últimas 24 h: 2 de 8',
  'Folga até a perda máxima: sem meta, não se aplica',
  'Movimento ÷ custo: 0,75 (mínimo: 2)',
] as const;
const LOCK_KEYS = ['daily_loss', 'loss_streak', 'trade_count', 'goal_room', 'move_cost'] as const;

export function buildLocks(activeKey: string | undefined = 'move_cost'): Record<string, unknown>[] {
  return LOCK_KEYS.map((key, index) => ({
    key,
    current: key === 'move_cost' ? '0.75' : '0',
    limit: '1',
    isActive: key === activeKey,
    isApplicable: key !== 'goal_room',
    line: LOCK_LINES[index],
    message: key === activeKey ? MOVE_COST_REASON : null,
  }));
}

export function buildSpecialist(
  key: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const labels: Record<string, string> = {
    trend: 'Tendência',
    reversion: 'Reversão',
    volume: 'Volume',
    sentiment: 'Sentimento',
    strategy: 'Tendência da estratégia',
  };
  return {
    key,
    vote: 0,
    isUnread: false,
    predictions: 2880,
    counted: 1881,
    hits: 908,
    misses: 973,
    ties: 2,
    upMoves: 922,
    hitRate: '0.4827',
    upRate: '0.4901',
    verdict: 'even',
    lower: '0.460197658745',
    upper: '0.505316684741',
    weight: '0',
    label: labels[key],
    voteLabel: 'neutro',
    accuracyText: '48,27% (908 de 1.881)',
    verdictLabel: 'rebaixado: igual à moeda',
    weightText: key === 'strategy' ? 'não vota' : '0',
    motive: key === 'strategy' ? null : 'as médias estão empatadas',
    ...overrides,
  };
}

export function buildTeam(): Record<string, unknown>[] {
  return [
    buildSpecialist('trend'),
    buildSpecialist('reversion', {
      vote: 1,
      voteLabel: 'a favor',
      verdict: 'above',
      verdictLabel: 'provou valor',
      accuracyText: '55,64% (1.420 de 2.552)',
      weight: '0.037080466592',
      weightText: '0,04',
      motive: 'o RSI (28,4) está abaixo de 30',
    }),
    buildSpecialist('volume', {
      vote: -1,
      voteLabel: 'contra',
      verdict: 'below',
      verdictLabel: 'rebaixado: errou mais que a moeda',
      motive: 'o volume (OBV) está abaixo da média dele',
    }),
    buildSpecialist('sentiment', {
      vote: null,
      isUnread: true,
      voteLabel: 'sem leitura',
      verdict: 'too_few',
      verdictLabel: 'em observação: menos de 30',
      accuracyText: '— (12 contadas)',
      motive: 'sem leitura do Fear & Greed há mais de 48 horas',
    }),
    buildSpecialist('strategy'),
  ];
}

export type DecidedOptions = {
  readonly candleTime?: number;
  readonly posture?: string;
  readonly postureLabel?: string;
  readonly message?: string;
  readonly reasonMessage?: string;
  readonly cadenceMinutes?: number;
  readonly riskScale?: string;
  readonly activeLock?: string | undefined;
  readonly noForecastReason?: string | null;
  readonly timeExitMessage?: string | null;
};

export function buildDecided(options: DecidedOptions = {}): Record<string, unknown> {
  const candleTime = options.candleTime ?? FIXTURE_CANDLE_TIME;
  return {
    status: 'decided',
    candleTime,
    closedAt: candleTime + QUARTER_HOUR,
    posture: options.posture ?? 'pause',
    postureLabel: options.postureLabel ?? 'PAUSA',
    cadenceMinutes: options.cadenceMinutes ?? 60,
    isOnCadence: true,
    entryGate: 'closed',
    riskScale: options.riskScale ?? '0',
    maxTradeMinutes: 60,
    timeExitDue: options.timeExitMessage !== undefined && options.timeExitMessage !== null,
    forecast: {
      side: null,
      strength: null,
      noForecastReason:
        options.noForecastReason === undefined ? 'no_proven_specialist' : options.noForecastReason,
      forWeight: '0',
      againstWeight: '0',
      provenWeight: '0',
    },
    specialists: buildTeam(),
    readings: {
      relativeVolume: '0.770477615048',
      atrRate: '0.002270465929',
      atrPercentile90: '0.003622358921',
      atrPercentile95: '0.004176969407',
      momentumShort: '0.000269409714',
      momentumLong: '-0.001936937603',
      roundTripCost: '0.003',
      moveToCost: '0.756821976333',
    },
    commands: [{ commandId: `analyst:${candleTime}:halt`, kind: 'halt', reason: 'analyst_pause' }],
    isShadow: true,
    message: options.message ?? PAUSE_LINE,
    reasonMessage: options.reasonMessage ?? MOVE_COST_REASON,
    cadenceLine: 'Volume 0,77× o normal das últimas 24 horas: olha o mercado a cada 1 hora.',
    offCadenceMessage: null,
    timeExitMessage: options.timeExitMessage ?? null,
    lockMessages: options.activeLock === undefined ? [MOVE_COST_REASON] : [],
    locks: buildLocks(options.activeLock),
    disclaimer: ANALYST_DISCLAIMER,
  };
}

export function buildFailed(candleTime: number): Record<string, unknown> {
  return {
    status: 'failed',
    candleTime,
    closedAt: candleTime + QUARTER_HOUR,
    isShadow: true,
    message: 'O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele.',
    failureCode: 'ANALYST_SERIES_UNAVAILABLE',
    disclaimer: ANALYST_DISCLAIMER,
  };
}

export function buildUnavailable(reason: string, message: string): Record<string, unknown> {
  return { status: 'unavailable', reason, message };
}

export function buildAnalystResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 'analyst-1',
    mode: 'shadow',
    modeMessage: SHADOW_MODE_MESSAGE,
    current: buildDecided(),
    goalProgress: null,
    locks: buildLocks(),
    ...overrides,
  };
}

export type AnalystHarness = {
  // O que o servidor responde agora para `/analyst`; `disabled` = 409 ANALYST_NOT_ENABLED e `failing` = 503.
  analyst: Record<string, unknown> | 'disabled' | 'failing';
  decisionPages: Array<{ items: unknown[]; nextCursor: string | null }>;
};

export function createAnalystHarness(overrides: Partial<AnalystHarness> = {}): AnalystHarness {
  return {
    analyst: buildAnalystResponse(),
    decisionPages: [{ items: [buildDecided()], nextCursor: null }],
    ...overrides,
  };
}

export function analystRoutes(harness: AnalystHarness): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: `${LIVE_BASE}/analyst`,
      respond: (): Response => {
        if (harness.analyst === 'disabled') return errorResponse(409, 'ANALYST_NOT_ENABLED');
        if (harness.analyst === 'failing') return errorResponse(503, 'UNAVAILABLE');
        return dataResponse(harness.analyst);
      },
    },
    {
      method: 'GET',
      path: `${LIVE_BASE}/analyst/decisions`,
      respond: (call): Response => {
        const cursor = call.query.get('cursor');
        const index = cursor === null ? 0 : Number(cursor.replace('page-', ''));
        const page = harness.decisionPages[index] ?? { items: [], nextCursor: null };
        return pageResponse(page.items, page.nextCursor);
      },
    },
  ];
}
