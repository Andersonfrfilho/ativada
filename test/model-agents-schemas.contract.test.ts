// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';
import { buildPromptInput } from './fixtures/model-agents/prompt-input.fixture.js';
import { buildReport } from './fixtures/model-agents/team-report.fixture.js';

// T1.1b da spec 015: o catálogo fechado das equipes, o esquema do relatório (RF07), a entrada do prompt (RF09) e o
// resultado da porta (RF01).

const api = await loadModelAgentsApi();

function reportAccepts(path: readonly string[], value: unknown): boolean {
  const { trend, risk, decision } = buildReport();
  const [first = '', second] = path;
  if (second === undefined) {
    return api.teamReportSchema.safeParse({ trend, risk, decision, [first]: value }).success;
  }
  const sections: Record<string, object> = { trend, risk, decision };
  const replaced = { ...sections, [first]: { ...(sections[first] ?? {}), [second]: value } };
  return api.teamReportSchema.safeParse(replaced).success;
}

function inputAccepts(overrides: Record<string, unknown>): boolean {
  return api.teamPromptInputSchema.safeParse({ ...buildPromptInput(), ...overrides }).success;
}

describe('catálogo fechado de equipes (RF03)', () => {
  test('são três equipes, uma por provedor', () => {
    expect(api.MODEL_TEAM_KEYS).toStrictEqual(['nina', 'lucas', 'olivia']);
    expect(api.MODEL_TEAMS.nina.provider).toBe('google');
    expect(api.MODEL_TEAMS.lucas.provider).toBe('anthropic');
    expect(api.MODEL_TEAMS.olivia.provider).toBe('openai');
    expect(api.MODEL_TEAMS.nina.modelFamily).toBe('Gemini Pro');
    expect(api.MODEL_TEAMS.lucas.modelFamily).toBe('Claude Sonnet');
    expect(api.MODEL_TEAMS.olivia.modelFamily).toBe('GPT');
    expect(api.MODEL_TEAMS.olivia.displayName).toBe('Olívia');
  });

  test('onde cada uma roda, em palavras', () => {
    expect(api.MODEL_TEAMS.nina.cloudLabel).toBe('nuvem do Google');
    expect(api.MODEL_TEAMS.lucas.cloudLabel).toBe('nuvem da Anthropic');
    expect(api.MODEL_TEAMS.olivia.cloudLabel).toBe('nuvem da OpenAI');
  });

  test('os três papéis internos, com o rótulo da tela', () => {
    expect(Object.values(api.TEAM_ROLE)).toStrictEqual(['trend', 'risk', 'decision']);
    expect(api.TEAM_ROLE_LABEL).toStrictEqual({
      trend: 'Analista de tendência',
      risk: 'Analista de risco',
      decision: 'Gestor',
    });
  });

  test('nenhuma definição carrega id de modelo nem preço (vêm do env)', () => {
    for (const team of Object.values(api.MODEL_TEAMS)) {
      expect(Object.keys(team).sort()).toStrictEqual(
        ['cloudLabel', 'displayName', 'key', 'modelFamily', 'provider'].sort(),
      );
    }
  });

  test('o guarda aceita só chave do catálogo', () => {
    expect(api.isModelTeamKey('nina')).toBe(true);
    expect(api.isModelTeamKey('clara')).toBe(false);
    expect(api.isModelTeamKey('Nina')).toBe(false);
    expect(api.isModelTeamKey(undefined)).toBe(false);
  });
});

describe('esquema do relatório da equipe (RF07)', () => {
  test('aceita o relatório válido de compra, de venda e de espera', () => {
    for (const action of ['buy', 'sell', 'hold'] as const) {
      expect(api.teamReportSchema.safeParse(buildReport(action)).success).toBe(true);
    }
  });

  test.each([0, 100])('confiança %i está dentro', (value) => {
    expect(reportAccepts(['decision', 'confidence'], value)).toBe(true);
  });

  test.each([-1, 101, 62.5])('confiança %p está fora', (value) => {
    expect(reportAccepts(['decision', 'confidence'], value)).toBe(false);
  });

  test.each([
    ['trend', 'reason'],
    ['risk', 'reason'],
    ['decision', 'reason'],
  ])('motivo de %s: 1 e 160 caracteres passam; vazio e 161 reprovam', (role, field) => {
    expect(reportAccepts([role, field], 'a')).toBe(true);
    expect(reportAccepts([role, field], 'a'.repeat(160))).toBe(true);
    expect(reportAccepts([role, field], '')).toBe(false);
    expect(reportAccepts([role, field], 'a'.repeat(161))).toBe(false);
  });

  test('só os valores do catálogo em tendência, risco e ação', () => {
    expect(reportAccepts(['trend', 'stance'], 'down')).toBe(true);
    expect(reportAccepts(['trend', 'stance'], 'sideways')).toBe(false);
    expect(reportAccepts(['risk', 'level'], 'high')).toBe(true);
    expect(reportAccepts(['risk', 'level'], 'extreme')).toBe(false);
    expect(reportAccepts(['decision', 'action'], 'short')).toBe(false);
  });

  test('preço: texto decimal ou nulo; notação científica e negativo reprovam', () => {
    expect(reportAccepts(['decision', 'entryPrice'], '61700.5')).toBe(true);
    expect(reportAccepts(['decision', 'entryPrice'], null)).toBe(true);
    expect(reportAccepts(['decision', 'entryPrice'], '1e5')).toBe(false);
    expect(reportAccepts(['decision', 'entryPrice'], '-1')).toBe(false);
    expect(reportAccepts(['decision', 'entryPrice'], 61700)).toBe(false);
  });

  test('chave a mais e chave faltando reprovam, em qualquer nível', () => {
    expect(reportAccepts(['extra'], 1)).toBe(false);
    expect(reportAccepts(['trend', 'extra'], 1)).toBe(false);
    expect(reportAccepts(['decision', 'extra'], 1)).toBe(false);
    const { decision } = buildReport();
    const withoutStop = Object.fromEntries(
      Object.entries(decision).filter(([key]) => key !== 'stopPrice'),
    );
    expect(
      api.teamReportSchema.safeParse({ ...buildReport(), decision: withoutStop }).success,
    ).toBe(false);
  });
});

describe('coerência dos preços (RF07)', () => {
  const limits = { lastClose: '100', entryTolerancePercent: '1.5', minStopPercent: '0.2' };

  function verdict(
    prices: Partial<{
      entryPrice: string | null;
      targetPrice: string | null;
      stopPrice: string | null;
    }>,
    action: 'buy' | 'sell' | 'hold' = 'buy',
    minStopPercent = limits.minStopPercent,
  ): string {
    const decision = { ...buildReport(action).decision, ...prices };
    return api.checkTeamLevels({ decision, ...limits, minStopPercent });
  }

  test('compra coerente vale', () => {
    expect(verdict({})).toBe('valid');
  });

  test('compra exige os três preços', () => {
    expect(verdict({ entryPrice: null })).toBe('invalid_levels');
    expect(verdict({ targetPrice: null })).toBe('invalid_levels');
    expect(verdict({ stopPrice: null })).toBe('invalid_levels');
  });

  test('a ordem é proteção < entrada < alvo, sem igualdade (cada lado isolado)', () => {
    // Tolerância e proteção mínima satisfeitas: só a ordem decide.
    expect(verdict({ entryPrice: '101', targetPrice: '101', stopPrice: '100' })).toBe(
      'invalid_levels',
    );
    expect(verdict({ entryPrice: '101', targetPrice: '100.5', stopPrice: '100' })).toBe(
      'invalid_levels',
    );
    expect(verdict({ entryPrice: '100', targetPrice: '102', stopPrice: '100' }, 'buy', '0')).toBe(
      'invalid_levels',
    );
    expect(verdict({ entryPrice: '100', targetPrice: '102', stopPrice: '101' }, 'buy', '0')).toBe(
      'invalid_levels',
    );
    expect(verdict({ entryPrice: '100', targetPrice: '102', stopPrice: '99' }, 'buy', '0')).toBe(
      'valid',
    );
  });

  test('entrada no limite de 1,5% do fechamento vale; um pouco além, não', () => {
    expect(verdict({ entryPrice: '101.5', targetPrice: '104', stopPrice: '100' })).toBe('valid');
    expect(verdict({ entryPrice: '98.5', targetPrice: '102', stopPrice: '97' })).toBe('valid');
    expect(verdict({ entryPrice: '101.51', targetPrice: '104', stopPrice: '100' })).toBe(
      'invalid_levels',
    );
    expect(verdict({ entryPrice: '98.49', targetPrice: '102', stopPrice: '97' })).toBe(
      'invalid_levels',
    );
  });

  test('proteção a 0,2% da entrada vale; mais colada, não', () => {
    expect(verdict({ entryPrice: '100', targetPrice: '101', stopPrice: '99.8' })).toBe('valid');
    expect(verdict({ entryPrice: '100', targetPrice: '101', stopPrice: '99.81' })).toBe(
      'invalid_levels',
    );
  });

  test('venda e espera exigem os três preços nulos', () => {
    expect(verdict({ entryPrice: null, targetPrice: null, stopPrice: null }, 'sell')).toBe('valid');
    expect(verdict({ entryPrice: null, targetPrice: null, stopPrice: null }, 'hold')).toBe('valid');
    expect(verdict({ entryPrice: '100' }, 'sell')).toBe('invalid_levels');
    expect(verdict({ targetPrice: '101' }, 'hold')).toBe('invalid_levels');
    expect(verdict({ stopPrice: '99' }, 'hold')).toBe('invalid_levels');
  });

  test('a conta é decimal exata, sem erro de ponto flutuante', () => {
    const decision = {
      ...buildReport('buy').decision,
      entryPrice: '100.3',
      targetPrice: '105',
      stopPrice: '99',
    };
    expect(
      api.checkTeamLevels({
        decision,
        lastClose: '100',
        entryTolerancePercent: '0.3',
        minStopPercent: '1.2',
      }),
    ).toBe('valid');
  });
});

describe('entrada do prompt (RF09)', () => {
  test('aceita a entrada completa de 48 velas e a de 1 vela', () => {
    expect(inputAccepts({})).toBe(true);
    expect(inputAccepts(buildPromptInput(1))).toBe(true);
  });

  test('recusa 49 velas e nenhuma vela', () => {
    expect(inputAccepts(buildPromptInput(49))).toBe(false);
    expect(inputAccepts({ candles: [] })).toBe(false);
  });

  test.each(['userId', 'runId', 'goalId', 'balance', 'email', 'position'])(
    'recusa a chave %s',
    (key) => {
      expect(inputAccepts({ [key]: 'x' })).toBe(false);
    },
  );

  test('recusa chave a mais dentro das leituras e do Fear & Greed', () => {
    const { readings } = buildPromptInput();
    expect(inputAccepts({ readings: { ...readings, userId: 'x' } })).toBe(false);
    const fearGreed = { value: 1, observedAt: '2026-10-17T00:00:00.000Z', note: 'x' };
    expect(inputAccepts({ fearGreed })).toBe(false);
  });

  test('o Fear & Greed pode faltar; número que não é texto decimal reprova', () => {
    expect(inputAccepts({ fearGreed: null })).toBe(true);
    const { readings } = buildPromptInput();
    expect(inputAccepts({ readings: { ...readings, atrRate: '1e-3' } })).toBe(false);
  });

  test('só o par maiúsculo e a vela de 15 min', () => {
    expect(inputAccepts({ symbol: 'link' })).toBe(false);
    expect(inputAccepts({ timeframe: '1h' })).toBe(false);
  });
});

describe('resultado da porta (RF01)', () => {
  test('os nove códigos do spec', () => {
    const codes: string[] = Object.values(api.MODEL_CALL_STATUS);
    expect(codes.sort()).toStrictEqual(
      [
        'bad_request',
        'invalid_output',
        'key_rejected',
        'model_not_found',
        'ok',
        'rate_limited',
        'refused',
        'timeout',
        'unavailable',
      ].sort(),
    );
  });
});
