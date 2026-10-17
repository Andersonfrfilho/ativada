// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';
import { buildPromptInput } from './fixtures/model-agents/prompt-input.fixture.js';

// T1.2 da spec 015 (plan D3, RF09): o `prompt-1` literal com o hash, e a varredura de privacidade do prompt pronto.

const api = await loadModelAgentsApi();

const GOLDEN_PROMPT = [
  'Você é um analista de mercado de criptomoedas e lê apenas dados de velas de 15 minutos.',
  'Pergunta única: a próxima vela de 15 min do par fecha acima, abaixo ou sem opinião em relação ao fechamento da última vela?',
  'Responda só pelo formato pedido (ferramenta ou JSON) com os campos posture, reason e confidence.',
  'posture: up (fecha acima), down (fecha abaixo) ou neutral (sem leitura clara).',
  'reason: uma linha de até 160 caracteres, sem prometer nada e sem recomendar compra ou venda.',
  'confidence: inteiro de 0 a 100.',
  'Use neutral quando não houver leitura clara.',
  'Os dados vêm em JSON: candles = [abertura em ms UTC, abertura, máxima, mínima, fechamento, volume]; readings = leituras públicas; fearGreed = índice de 0 a 100 ou null.',
  '',
  'DADOS:',
  '{"symbol":"LINKUSDT","timeframe":"15m","lastCandleCloseTime":"2026-10-17T00:00:00.000Z","candles":[[1760000000000,"100.00","101.00","99.00","100.50","1000"],[1760000900000,"100.50","101.50","99.50","101.00","1001"]],"readings":{"relativeVolume":"1.25","atrRate":"0.004","atrPercentile90":"0.0051","atrPercentile95":null,"momentumShort":"0.002","momentumLong":"-0.01"},"fearGreed":{"value":42,"observedAt":"2026-10-17T00:00:00.000Z"}}',
].join('\n');
const GOLDEN_HASH = '717b35633d17de92e96f4e5dff30b9019da9d01912d2d5878832d1b0877b027d';

function goldenInput(): ReturnType<typeof buildPromptInput> {
  return {
    ...buildPromptInput(2),
    lastCandleCloseTime: '2026-10-17T00:00:00.000Z',
    candles: [
      [1760000000000, '100.00', '101.00', '99.00', '100.50', '1000'],
      [1760000900000, '100.50', '101.50', '99.50', '101.00', '1001'],
    ],
  };
}

describe('prompt-1 (dourado literal)', () => {
  test('a versão é prompt-1', () => {
    expect(api.PROMPT_VERSION).toBe('prompt-1');
  });

  test('o texto renderizado é exatamente o dourado', () => {
    expect(api.renderPrompt(goldenInput())).toBe(GOLDEN_PROMPT);
  });

  test('o hash é o SHA-256 em hexadecimal do dourado', () => {
    expect(api.hashPrompt(GOLDEN_PROMPT)).toBe(GOLDEN_HASH);
    expect(api.hashPrompt(GOLDEN_PROMPT)).toBe(
      createHash('sha256').update(GOLDEN_PROMPT).digest('hex'),
    );
  });

  test('a ordem das chaves da entrada não muda o texto', () => {
    const input = goldenInput();
    const shuffled = {
      fearGreed: input.fearGreed,
      readings: {
        momentumLong: input.readings.momentumLong,
        momentumShort: input.readings.momentumShort,
        atrPercentile95: input.readings.atrPercentile95,
        atrPercentile90: input.readings.atrPercentile90,
        atrRate: input.readings.atrRate,
        relativeVolume: input.readings.relativeVolume,
      },
      candles: input.candles,
      lastCandleCloseTime: input.lastCandleCloseTime,
      timeframe: input.timeframe,
      symbol: input.symbol,
    };
    expect(api.renderPrompt(shuffled)).toBe(GOLDEN_PROMPT);
  });

  test('uma vela diferente muda o hash', () => {
    const changed = { ...goldenInput(), symbol: 'LINKBTC' };
    expect(api.hashPrompt(api.renderPrompt(changed))).not.toBe(GOLDEN_HASH);
  });

  test('entrada com chave de fora não vira prompt', () => {
    expect(() => api.renderPrompt(Object.assign(goldenInput(), { userId: 'x' }))).toThrow();
  });
});

describe('varredura de privacidade (RF09)', () => {
  test('o prompt de 48 velas, com e sem Fear & Greed, não tem violação', () => {
    for (const fearGreed of [buildPromptInput().fearGreed, null]) {
      const prompt = api.renderPrompt({ ...buildPromptInput(), fearGreed });
      expect(api.findPromptPrivacyViolations(prompt)).toStrictEqual([]);
    }
  });

  test('a instrução fixa também está limpa', () => {
    expect(api.findPromptPrivacyViolations(api.PROMPT_INSTRUCTION)).toStrictEqual([]);
  });

  test('acha UUID', () => {
    const prompt = `${api.PROMPT_INSTRUCTION} 123e4567-e89b-12d3-a456-426614174000`;
    expect(api.findPromptPrivacyViolations(prompt)).toContain(api.PROMPT_VIOLATION.UUID);
  });

  test('acha arroba', () => {
    const prompt = `${api.PROMPT_INSTRUCTION} alguem@exemplo.com`;
    expect(api.findPromptPrivacyViolations(prompt)).toContain(api.PROMPT_VIOLATION.AT_SIGN);
  });

  test('acha chave fora da lista, com o nome dela', () => {
    const prompt = `${api.PROMPT_INSTRUCTION}\n{"userId":"x","accountBalance":"10"}`;
    const violations = api.findPromptPrivacyViolations(prompt);
    expect(violations).toContain('unknown_key:userId');
    expect(violations).toContain('unknown_key:accountBalance');
  });

  test.each(['saldo', 'balance', 'equity', 'email', 'userId'])(
    'acha a palavra sensível %s',
    (word) => {
      const violations = api.findPromptPrivacyViolations(`${api.PROMPT_INSTRUCTION} ${word}`);
      expect(violations.some((entry) => entry.startsWith('sensitive_word:'))).toBe(true);
    },
  );

  test('toda chave que o renderizador escreve está na lista permitida', () => {
    const prompt = api.renderPrompt(buildPromptInput());
    const keys = [...prompt.matchAll(/"([A-Za-z0-9_]+)":/g)].map((match) => match[1] ?? '');
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect(api.ALLOWED_PROMPT_KEYS).toContain(key);
  });
});
