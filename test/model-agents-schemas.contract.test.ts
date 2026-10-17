// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';
import { buildPromptInput } from './fixtures/model-agents/prompt-input.fixture.js';

// T1.1 da spec 015: o catálogo fechado, o esquema da opinião (RF07), a entrada do prompt (RF09) e o resultado da porta (RF01).

const api = await loadModelAgentsApi();
const VALID = { posture: 'up', reason: 'Três velas fecharam acima da EMA.', confidence: 62 };

function opinionAccepts(overrides: Record<string, unknown>): boolean {
  return api.modelOpinionSchema.safeParse({ ...VALID, ...overrides }).success;
}

function inputAccepts(overrides: Record<string, unknown>): boolean {
  return api.modelPromptInputSchema.safeParse({ ...buildPromptInput(), ...overrides }).success;
}

describe('catálogo fechado de agentes (RF03)', () => {
  test('são três agentes, com o provedor e o cargo do spec', () => {
    expect(api.MODEL_AGENT_KEYS).toStrictEqual(['nina', 'lucas', 'clara']);
    expect(api.MODEL_AGENTS.nina.provider).toBe('google');
    expect(api.MODEL_AGENTS.lucas.provider).toBe('anthropic');
    expect(api.MODEL_AGENTS.clara.provider).toBe('anthropic');
    expect(api.MODEL_AGENTS.nina.modelFamily).toBe('Gemini Pro');
    expect(api.MODEL_AGENTS.lucas.modelFamily).toBe('Claude Sonnet');
    expect(api.MODEL_AGENTS.clara.modelFamily).toBe('Claude Haiku');
    expect(api.MODEL_AGENT_ROLE).toBe('Analista de modelo');
  });

  test('onde cada um roda, em palavras', () => {
    expect(api.MODEL_AGENTS.nina.cloudLabel).toBe('nuvem do Google');
    expect(api.MODEL_AGENTS.lucas.cloudLabel).toBe('nuvem da Anthropic');
    expect(api.MODEL_AGENTS.clara.cloudLabel).toBe('nuvem da Anthropic');
  });

  test('nenhuma definição carrega id de modelo nem preço (vêm do env)', () => {
    for (const agent of Object.values(api.MODEL_AGENTS)) {
      expect(Object.keys(agent).sort()).toStrictEqual(
        ['cloudLabel', 'displayName', 'key', 'modelFamily', 'provider'].sort(),
      );
    }
  });

  test('o guarda aceita só chave do catálogo', () => {
    expect(api.isModelAgentKey('nina')).toBe(true);
    expect(api.isModelAgentKey('Nina')).toBe(false);
    expect(api.isModelAgentKey('ana')).toBe(false);
    expect(api.isModelAgentKey(undefined)).toBe(false);
  });
});

describe('esquema da opinião (RF07)', () => {
  test('aceita a opinião válida', () => {
    expect(opinionAccepts({})).toBe(true);
  });

  test.each([0, 100])('confiança %i está dentro', (confidence) => {
    expect(opinionAccepts({ confidence })).toBe(true);
  });

  test.each([-1, 101, 62.5])('confiança %p está fora', (confidence) => {
    expect(opinionAccepts({ confidence })).toBe(false);
  });

  test('motivo: 1 e 160 caracteres passam; vazio e 161 reprovam', () => {
    expect(opinionAccepts({ reason: 'a' })).toBe(true);
    expect(opinionAccepts({ reason: 'a'.repeat(160) })).toBe(true);
    expect(opinionAccepts({ reason: '' })).toBe(false);
    expect(opinionAccepts({ reason: 'a'.repeat(161) })).toBe(false);
  });

  test('só up, down e neutral', () => {
    for (const posture of ['up', 'down', 'neutral']) expect(opinionAccepts({ posture })).toBe(true);
    expect(opinionAccepts({ posture: 'buy' })).toBe(false);
  });

  test('chave a mais e chave faltando reprovam', () => {
    expect(opinionAccepts({ extra: 1 })).toBe(false);
    expect(api.modelOpinionSchema.safeParse({ posture: 'up', reason: 'x' }).success).toBe(false);
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

  test.each(['userId', 'runId', 'goalId', 'balance', 'email'])('recusa a chave %s', (key) => {
    expect(inputAccepts({ [key]: 'x' })).toBe(false);
  });

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
