// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FakeRoute } from './fake-fetch.js';
import { dataResponse, errorResponse, pageResponse } from './fake-fetch.js';
import type { ModelTeamKey } from '../../src/runs/model-teams/model-teams.constant.js';
import type {
  ComparisonItem,
  Recommendation,
  RunModelTeams,
  Scoreboard,
  TeamState,
  TeamView,
} from '../../src/runs/model-teams/model-teams.validation.js';

export const QUARTER = 900_000;
export const TEAM_NOTICE =
  'Equipe de modelo: um modelo de linguagem lê os mesmos dados públicos de mercado, com três papéis, e indica compra, venda ou espera. Pode errar; o auditor mede o acerto. Não é recomendação. Tudo simulado.';

const VISUAL: Readonly<
  Record<
    ModelTeamKey,
    { name: string; provider: TeamView['provider']; family: string; cloud: string }
  >
> = {
  nina: { name: 'Nina', provider: 'google', family: 'Gemini Pro', cloud: 'nuvem do Google' },
  lucas: {
    name: 'Lucas',
    provider: 'anthropic',
    family: 'Claude Sonnet',
    cloud: 'nuvem da Anthropic',
  },
  olivia: { name: 'Olívia', provider: 'openai', family: 'GPT', cloud: 'nuvem da OpenAI' },
};

export function buildTeamView(teamKey: ModelTeamKey, overrides: Partial<TeamView> = {}): TeamView {
  const visual = VISUAL[teamKey];
  return {
    teamKey,
    displayName: visual.name,
    provider: visual.provider,
    modelFamily: visual.family,
    cloudLabel: visual.cloud,
    isEnabled: true,
    providerStatus: {
      state: 'ready',
      keyConfigured: true,
      modelConfigured: true,
      circuitUntil: null,
      message: '● pronto',
      isAvailable: true,
    },
    ...overrides,
  };
}

export function buildNoKeyTeam(teamKey: ModelTeamKey): TeamView {
  return buildTeamView(teamKey, {
    providerStatus: {
      state: 'no_key',
      keyConfigured: false,
      modelConfigured: false,
      circuitUntil: null,
      message: '⚠ sem chave configurada',
      isAvailable: false,
    },
  });
}

export function buildRecommendation(
  teamKey: ModelTeamKey,
  overrides: Partial<Recommendation> = {},
): Recommendation {
  const candleTime = 1_700_000_000_000 - (1_700_000_000_000 % QUARTER);
  return {
    id: `rec-${teamKey}-${candleTime}`,
    teamKey,
    isOnDemand: false,
    onDemandMark: null,
    candleTime,
    closedAt: candleTime + QUARTER,
    status: 'decided',
    failureCode: null,
    action: 'buy',
    actionLabel: 'comprar',
    levels: { entryPrice: '100.00', targetPrice: '103.50', stopPrice: '98.40' },
    confidence: 72,
    roles: {
      trend: { stance: 'up', reason: 'Fechamentos subindo nas últimas velas.' },
      risk: { level: 'medium', reason: 'A faixa da vela está normal.' },
      decision: { reason: 'Entrada perto do fechamento.' },
    },
    isReasonHidden: false,
    generatedBy: `gerado por modelo: ${VISUAL[teamKey].family} · pode errar`,
    latencyMilliseconds: 820,
    costUsd: '0.01090000',
    decidedAt: '2026-10-17T12:00:00.000Z',
    ...overrides,
  };
}

export function buildScoreboard(overrides: Partial<Scoreboard> = {}): Scoreboard {
  return {
    hits: 3,
    misses: 2,
    ties: 0,
    counted: 5,
    hitRate: '0.60000000',
    verdict: 'too_few',
    lower: '0.23073000',
    upper: '0.88245000',
    sinceDays: 30,
    ...overrides,
  };
}

export function buildTeamState(
  teamKey: ModelTeamKey,
  overrides: Partial<TeamState> = {},
): TeamState {
  return {
    team: buildTeamView(teamKey),
    recent: [buildRecommendation(teamKey)],
    onDemand: [],
    scoreboard: buildScoreboard(),
    cost: { todayUsd: '0.03270000', monthUsd: '0.98100000' },
    failures: { hours: 24, total: 24, failed: 3 },
    ...overrides,
  };
}

export function buildRunModelTeams(overrides: Partial<RunModelTeams> = {}): RunModelTeams {
  return {
    symbol: 'BTCUSDT',
    signalSource: null,
    notice: TEAM_NOTICE,
    costNotice:
      'Estimativa pelos tokens e pelo preço configurado; a fatura do provedor é a palavra final.',
    comparisonNotice:
      'Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação.',
    teams: [buildTeamState('nina'), buildTeamState('lucas'), buildTeamState('olivia')],
    totalCost: { todayUsd: '0.09810000', monthUsd: '2.94300000' },
    ...overrides,
  };
}

export function buildComparisonItem(
  candleTime: number,
  overrides: Partial<ComparisonItem> = {},
): ComparisonItem {
  return {
    candleTime,
    closedAt: candleTime + QUARTER,
    close: '100.00',
    next: 'up',
    nextClose: '100.50',
    rules: [
      { key: 'trend', vote: 1, isHit: true },
      { key: 'reversion', vote: -1, isHit: false },
      { key: 'volume', vote: 0, isHit: null },
      { key: 'sentiment', vote: 1, isHit: true },
    ],
    teams: [
      { teamKey: 'nina', status: 'decided', action: 'buy', isHit: true },
      { teamKey: 'lucas', status: 'decided', action: 'hold', isHit: null },
      { teamKey: 'olivia', status: 'failed', action: null, isHit: null },
    ],
    ...overrides,
  };
}

export type ModelTeamsHarness = {
  state: RunModelTeams | 'absent';
  comparison: readonly ComparisonItem[];
  myTeams: readonly TeamView[];
  readonly patched: { teamKey: string; enabled: boolean }[];
  readonly opinions: string[];
};

export function createModelTeamsHarness(state: RunModelTeams | 'absent'): ModelTeamsHarness {
  return {
    state,
    comparison: [],
    myTeams: [buildTeamView('nina'), buildTeamView('lucas'), buildTeamView('olivia')],
    patched: [],
    opinions: [],
  };
}

function readEnabled(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'enabled' in body && body.enabled === true;
}

export function modelTeamsRoutes(harness: ModelTeamsHarness, runId: string): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: `/v1/runs/${runId}/model-teams`,
      respond: () =>
        harness.state === 'absent'
          ? errorResponse(409, 'RUN_NOT_LIVE')
          : dataResponse(harness.state),
    },
    {
      method: 'GET',
      path: `/v1/runs/${runId}/model-teams/comparison`,
      respond: () => pageResponse(harness.comparison),
    },
    {
      method: 'GET',
      path: '/v1/me/model-teams',
      respond: () => dataResponse({ notice: TEAM_NOTICE, teams: harness.myTeams }),
    },
    ...(['nina', 'lucas', 'olivia'] as const).flatMap((teamKey) => [
      {
        method: 'POST',
        path: `/v1/runs/${runId}/model-teams/${teamKey}/opinions`,
        respond: (): Response => {
          harness.opinions.push(teamKey);
          return dataResponse({ opinionId: `opinion-${teamKey}` }, 202);
        },
      },
      {
        method: 'PATCH',
        path: `/v1/me/model-teams/${teamKey}`,
        respond: (call: { body: unknown }): Response => {
          const enabled = readEnabled(call.body);
          harness.patched.push({ teamKey, enabled });
          const updated = buildTeamView(teamKey, { isEnabled: enabled });
          harness.myTeams = harness.myTeams.map((team) =>
            team.teamKey === teamKey ? updated : team,
          );
          return dataResponse(updated);
        },
      },
    ]),
  ];
}
