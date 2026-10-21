// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { environmentSchema } from '../apps/worker-ativada/src/environment.js';
import { buildTeamRuntimes } from '../apps/worker-ativada/src/model-teams/build-team-runtimes.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

type Source = Record<string, string>;

const SENTINEL = 'sk-test-SENTINEL-0123456789-abcdefghijklmnop';
const PRODUCTION_DATABASE_URL =
  'postgres://ativada:prod-password-0123456789-abcdefghijkl@db.internal:5432/crypto?sslmode=verify-full';
const BUDGETS: Source = { MODEL_TEAM_DAILY_BUDGET_USD: '2', MODEL_TEAM_MONTHLY_BUDGET_USD: '50' };
const LUCAS: Source = {
  ANTHROPIC_API_KEY: SENTINEL,
  MODEL_TEAM_LUCAS_MODEL: 'fake-model-1',
  MODEL_TEAM_LUCAS_INPUT_USD_PER_MTOK: '2',
  MODEL_TEAM_LUCAS_OUTPUT_USD_PER_MTOK: '10',
};

async function buildSource(overrides: Source = {}): Promise<Source> {
  return { ...(await readEnvironmentFile('env.test')), ...overrides };
}

function issuesOf(source: Source): string {
  try {
    parseEnvironment(environmentSchema, source);
  } catch (error: unknown) {
    if (error instanceof EnvironmentError) return error.message;
    throw error;
  }
  return '';
}

describe('ambiente do worker: equipes de modelo (spec 015)', () => {
  test('sem chave nenhuma o worker sobe, nenhuma equipe existe e os padrões são os autorizados', async () => {
    const environment = parseEnvironment(environmentSchema, await buildSource());
    expect(buildTeamRuntimes(environment)).toStrictEqual([]);
    expect(environment.MODEL_TEAM_CADENCE_MINUTES).toBe('60');
    expect(environment.MODEL_TEAM_TIMEOUT_SECONDS).toBe(30);
    expect(environment.MODEL_TEAM_MAX_OUTPUT_TOKENS).toBe(900);
    expect(environment.MODEL_TEAM_CONCURRENCY).toBe(3);
    expect(environment.MODEL_TEAM_POLL_SECONDS).toBe(2);
    expect(environment.MODEL_TEAM_DECISION_DEADLINE_SECONDS).toBe(45);
    expect(environment.MODEL_TEAM_NINA_THINKING_LEVEL).toBe('low');
    expect(environment.MODEL_TEAM_OLIVIA_REASONING_EFFORT).toBe('low');
    expect(environment.MODEL_TEAM_ENTRY_TOLERANCE_PERCENT).toBe('1.5');
    expect(environment.MODEL_TEAM_MIN_STOP_PERCENT).toBe('0.2');
  });

  test('chave com id, preços e tetos liga só aquela equipe, com o id e o preço do env', async () => {
    const environment = parseEnvironment(
      environmentSchema,
      await buildSource({ ...LUCAS, ...BUDGETS }),
    );
    const runtimes = buildTeamRuntimes(environment);
    expect(runtimes.map((runtime) => runtime.teamKey)).toStrictEqual(['lucas']);
    expect(runtimes[0]?.modelId).toBe('fake-model-1');
    expect(runtimes[0]?.price).toStrictEqual({
      inputUsdPerMegaToken: '2',
      outputUsdPerMegaToken: '10',
    });
  });

  test('chave sem id ou sem preço faz o boot falhar, citando só o NOME da variável', async () => {
    for (const missing of Object.keys(LUCAS).filter((name) => name !== 'ANTHROPIC_API_KEY')) {
      const source = await buildSource({ ...LUCAS, ...BUDGETS });
      delete source[missing];
      const issues = issuesOf(source);
      expect(issues).toContain(missing);
      expect(issues).not.toContain(SENTINEL);
    }
  });

  test('qualquer chave exige os dois tetos, e o diário não passa do mensal', async () => {
    expect(issuesOf(await buildSource(LUCAS))).toContain('MODEL_TEAM_DAILY_BUDGET_USD');
    expect(issuesOf(await buildSource(LUCAS))).toContain('MODEL_TEAM_MONTHLY_BUDGET_USD');
    const inverted = await buildSource({
      ...LUCAS,
      MODEL_TEAM_DAILY_BUDGET_USD: '60',
      MODEL_TEAM_MONTHLY_BUDGET_USD: '50',
    });
    expect(issuesOf(inverted)).toContain('MODEL_TEAM_DAILY_BUDGET_USD');
    expect(issuesOf(await buildSource({ ...BUDGETS, MODEL_TEAM_DAILY_BUDGET_USD: '0' }))).toContain(
      'MODEL_TEAM_DAILY_BUDGET_USD',
    );
  });

  test('faixas e formatos: ritmo, tempo-limite, id do modelo e preço', async () => {
    const bad: readonly Source[] = [
      { MODEL_TEAM_CADENCE_MINUTES: '30' },
      { MODEL_TEAM_TIMEOUT_SECONDS: '4' },
      { MODEL_TEAM_TIMEOUT_SECONDS: '91' },
      { MODEL_TEAM_CONCURRENCY: '7' },
      { MODEL_TEAM_MAX_OUTPUT_TOKENS: '199' },
      { MODEL_TEAM_NINA_THINKING_LEVEL: 'minimal' },
      { MODEL_TEAM_LUCAS_MODEL: 'Modelo Com Espaço' },
      { MODEL_TEAM_LUCAS_INPUT_USD_PER_MTOK: '1.123456789' },
      { MODEL_TEAM_ENTRY_TOLERANCE_PERCENT: '0' },
    ];
    for (const override of bad) expect(issuesOf(await buildSource(override))).not.toBe('');
    const cadence = parseEnvironment(
      environmentSchema,
      await buildSource({ MODEL_TEAM_CADENCE_MINUTES: '15' }),
    );
    expect(cadence.MODEL_TEAM_CADENCE_MINUTES).toBe('15');
  });

  test('em produção as três chaves são segredo (tamanho mínimo) e os hosts exigem https', async () => {
    const production: Source = {
      ENV: 'production',
      DATABASE_URL: PRODUCTION_DATABASE_URL,
      BINANCE_BASE_URL: 'https://data-api.binance.vision',
      BINANCE_STREAM_URL: 'wss://data-stream.binance.vision',
      TELEGRAM_API_BASE_URL: 'https://api.telegram.org',
    };
    for (const name of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) {
      const issues = issuesOf(await buildSource({ ...production, ...BUDGETS, [name]: 'curta' }));
      expect(issues).toContain(name);
      expect(issues).not.toContain('curta');
    }
    const insecure = await buildSource({ ...production, GEMINI_BASE_URL: 'http://gemini.example' });
    expect(issuesOf(insecure)).toContain('GEMINI_BASE_URL');
    const insecureOpenAi = await buildSource({
      ...production,
      OPENAI_BASE_URL: 'http://openai.example',
    });
    expect(issuesOf(insecureOpenAi)).toContain('OPENAI_BASE_URL');
  });
});
