// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildProjectionsResponse, buildProjectionsSummary } from './candle-chart-fixtures.js';
import { FIXTURE_CANDLE_TIME, buildLiveStatusResponse } from './live-status-fixtures.js';
import {
  buildDecisionAt,
  buildRunSection,
  createLiveHarness,
  HOUR,
  LIVE_BASE,
  liveRoutes,
  type LiveHarness,
} from './live-tracking-harness.js';
import type { FakeRoute } from './fake-fetch.js';
import { dataResponse } from './fake-fetch.js';

export type VoteSpec = {
  readonly ruleId: string;
  readonly label: string;
  readonly kind: string;
  readonly vote: -1 | 0 | 1;
  readonly weight?: string;
  readonly isMissing?: boolean;
  // A leitura gravada na decisão (os monitores do escritório desenham a partir dela); sem ela, { value: '55' }.
  readonly reading?: Record<string, string>;
};

export const SERVER_MOTIVE = 'RSI: precisa ficar abaixo de 30 para votar a favor de comprar.';

export const DEFAULT_VOTES: readonly VoteSpec[] = [
  { ruleId: 'ema-9-21', label: 'Cruzamento de médias', kind: 'ema_cross', vote: 1 },
  { ruleId: 'macd-12-26-9', label: 'MACD', kind: 'macd', vote: 0 },
  { ruleId: 'rsi-14', label: 'RSI', kind: 'rsi', vote: -1 },
  { ruleId: 'obv-ema-20', label: 'Volume (OBV)', kind: 'obv_trend', vote: 0 },
  {
    ruleId: 'fear-greed-25-75',
    label: 'Medo e ganância',
    kind: 'fear_greed',
    vote: 0,
    isMissing: true,
  },
];

function voteOf(spec: VoteSpec): Record<string, unknown> {
  return {
    ruleId: spec.ruleId,
    label: spec.label,
    kind: spec.kind,
    vote: spec.vote,
    weight: spec.weight ?? '1',
    isMissing: spec.isMissing ?? false,
    reading: spec.isMissing === true ? null : (spec.reading ?? { value: '55' }),
  };
}

function triggerOf(spec: VoteSpec): Record<string, unknown> {
  return {
    ruleId: spec.ruleId,
    label: spec.label,
    kind: spec.kind,
    vote: spec.vote,
    weight: spec.weight ?? '1',
    isMet: spec.vote === 1,
    metric: 'rsi',
    direction: 'below',
    basis: 'exact',
    current: '55',
    threshold: '30',
    distance: '25',
    distanceRate: null,
    message: spec.ruleId === 'rsi-14' ? SERVER_MOTIVE : `${spec.label}: já vota para comprar.`,
  };
}

export type RoomOptions = {
  readonly votes?: readonly VoteSpec[];
  readonly hoursBefore?: number;
  readonly outcome?: string;
  readonly message?: string;
};

export function buildRoomDecision(options: RoomOptions = {}): Record<string, unknown> {
  return buildDecisionAt(options.hoursBefore ?? 0, {
    outcome: options.outcome ?? 'waited',
    message: options.message ?? 'Faltou 1 ponto: o RSI (55) está entre 30 e 70.',
    votes: (options.votes ?? DEFAULT_VOTES).map(voteOf),
  });
}

export function buildRoomLiveStatus(
  decisions: readonly Record<string, unknown>[],
  votes: readonly VoteSpec[] = DEFAULT_VOTES,
  runOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return buildLiveStatusResponse({
    run: buildRunSection(runOverrides),
    triggers: {
      status: 'available',
      state: 'awaiting_entry',
      score: '1',
      scoreThreshold: '2',
      scoreGap: '1',
      message: 'Faltam 1 ponto de 2 para comprar.',
      rules: votes.map(triggerOf),
    },
    decisions: { items: decisions, nextCursor: null },
  });
}

export function createRoomHarness(
  decisions: readonly Record<string, unknown>[] = [buildRoomDecision()],
): LiveHarness {
  return createLiveHarness({ liveStatus: buildRoomLiveStatus(decisions) });
}

export function roomRoutes(
  harness: LiveHarness,
  summary: Record<string, unknown> = buildProjectionsSummary(),
): readonly FakeRoute[] {
  return [
    ...liveRoutes(harness),
    {
      method: 'GET',
      path: `${LIVE_BASE}/projections`,
      respond: (): Response => dataResponse(buildProjectionsResponse({ summary })),
    },
  ];
}

export { buildDecisionAt, FIXTURE_CANDLE_TIME, HOUR };
