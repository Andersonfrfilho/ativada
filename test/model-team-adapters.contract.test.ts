// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, describe, expect, test } from 'bun:test';

import { createAnthropicProvider } from '../apps/worker-ativada/src/model-teams/anthropic-provider.js';
import { createGeminiProvider } from '../apps/worker-ativada/src/model-teams/gemini-provider.js';
import type { ModelProviderPort } from '../apps/worker-ativada/src/model-teams/model-provider.port.js';
import { createOpenAiProvider } from '../apps/worker-ativada/src/model-teams/openai-provider.js';
import {
  buildTeamReportJsonSchema,
  SCHEMA_DIALECT,
} from '../apps/worker-ativada/src/model-teams/team-report-json-schema.js';
import { MODEL_CALL_STATUS, type ModelCallResult } from '../packages/model-agents/src/index.js';
import {
  FAKE_BUY_REPORT,
  FAKE_PROVIDER,
  type FakeProviderKind,
} from '../packages/model-agents/test-support/fake-provider-payloads.js';
import {
  startFakeProvider,
  type FakeBehavior,
  type FakeProviderServer,
} from '../packages/model-agents/test-support/fake-provider-server.js';

const SENTINEL = 'sk-test-SENTINEL';
const MODEL = 'fake-model-1';
const LIMITS = { timeoutMilliseconds: 2_000, maxOutputTokens: 900 };
const PROMPT = 'DADOS: candles públicos';
const THINKING_BUDGET = 2_000;
const KINDS: readonly FakeProviderKind[] = [
  FAKE_PROVIDER.ANTHROPIC,
  FAKE_PROVIDER.GEMINI,
  FAKE_PROVIDER.OPENAI,
];

type Harness = {
  readonly server: FakeProviderServer;
  readonly build: (overrides?: { apiKey?: string; modelId?: string }) => ModelProviderPort;
};

function createHarness(kind: FakeProviderKind): Harness {
  const server = startFakeProvider({ kind, expectedKey: SENTINEL, expectedModel: MODEL });
  const build = (overrides: { apiKey?: string; modelId?: string } = {}): ModelProviderPort => {
    const common = {
      apiKey: overrides.apiKey ?? SENTINEL,
      baseUrl: server.url,
      modelId: overrides.modelId ?? MODEL,
    };
    if (kind === FAKE_PROVIDER.ANTHROPIC) return createAnthropicProvider(common);
    const extra = { maxThinkingTokens: THINKING_BUDGET };
    if (kind === FAKE_PROVIDER.GEMINI) {
      return createGeminiProvider({ ...common, ...extra, thinkingLevel: 'low' });
    }
    return createOpenAiProvider({ ...common, ...extra, reasoningEffort: 'low' });
  };
  return { server, build };
}

function readSent<TSent>(harness: Harness): TSent {
  const parsed: unknown = JSON.parse(harness.server.requests[0]?.body ?? '{}');
  return parsed as TSent;
}

async function call(port: ModelProviderPort, limits = LIMITS): Promise<ModelCallResult> {
  return port.requestTeamReport({
    team: 'nina',
    prompt: PROMPT,
    limits,
    signal: new AbortController().signal,
  });
}

async function callWith(harness: Harness, behavior: FakeBehavior): Promise<ModelCallResult> {
  harness.server.behavior = behavior;
  return call(harness.build());
}

function collectObjectNodes(
  node: unknown,
  found: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (typeof node !== 'object' || node === null) return found;
  const record = node as Record<string, unknown>;
  if (record['type'] === 'object') found.push(record);
  for (const value of Object.values(record)) collectObjectNodes(value, found);
  return found;
}

describe.each([...KINDS])('adaptador %s contra o provedor falso local', (kind) => {
  const harness = createHarness(kind);
  afterAll(async () => harness.server.stop());

  test('200 válido devolve o relatório validado, os tokens e a latência', async () => {
    const result = await callWith(harness, { kind: 'report' });
    expect(result.status).toBe(MODEL_CALL_STATUS.OK);
    if (result.status !== MODEL_CALL_STATUS.OK) return;
    expect(result.report).toStrictEqual(FAKE_BUY_REPORT);
    const thinking = kind === FAKE_PROVIDER.ANTHROPIC ? 0 : 300;
    expect(result.usage).toStrictEqual({
      inputTokens: 3_200,
      outputTokens: 450,
      thinkingTokens: thinking,
    });
    expect(result.latencyMilliseconds).toBeGreaterThanOrEqual(0);
  });

  test('saída fora do esquema (preço faltando, chave a mais, texto solto) é invalid_output e leva os tokens', async () => {
    const solto = await callWith(harness, { kind: 'invalid_output' });
    expect(solto.status).toBe(MODEL_CALL_STATUS.INVALID_OUTPUT);
    const extra = { ...FAKE_BUY_REPORT, userId: 'x' };
    expect((await callWith(harness, { kind: 'report', report: extra })).status).toBe(
      MODEL_CALL_STATUS.INVALID_OUTPUT,
    );
    const comprimento = { ...FAKE_BUY_REPORT, trend: { stance: 'up', reason: 'x'.repeat(161) } };
    const long = await callWith(harness, { kind: 'report', report: comprimento });
    expect(long.status).toBe(MODEL_CALL_STATUS.INVALID_OUTPUT);
    if (long.status === MODEL_CALL_STATUS.INVALID_OUTPUT) {
      expect(long.measure?.inputTokens).toBe(3_200);
    }
  });

  test('recusa do modelo é refused; estouro do teto de saída é invalid_output', async () => {
    expect((await callWith(harness, { kind: 'refusal' })).status).toBe(MODEL_CALL_STATUS.REFUSED);
    expect((await callWith(harness, { kind: 'truncated' })).status).toBe(
      MODEL_CALL_STATUS.INVALID_OUTPUT,
    );
  });

  test('cada código HTTP do RF01 vira o status certo', async () => {
    const limited = await callWith(harness, { kind: 'status', status: 429, retryAfterSeconds: 7 });
    expect(limited).toStrictEqual({
      status: MODEL_CALL_STATUS.RATE_LIMITED,
      retryAfterMilliseconds: 7_000,
    });
    expect((await callWith(harness, { kind: 'status', status: 500 })).status).toBe(
      MODEL_CALL_STATUS.UNAVAILABLE,
    );
    expect((await callWith(harness, { kind: 'status', status: 503 })).status).toBe(
      MODEL_CALL_STATUS.UNAVAILABLE,
    );
    expect((await callWith(harness, { kind: 'status', status: 400 })).status).toBe(
      MODEL_CALL_STATUS.BAD_REQUEST,
    );
    expect((await callWith(harness, { kind: 'status', status: 403 })).status).toBe(
      MODEL_CALL_STATUS.KEY_REJECTED,
    );
  });

  test('chave errada é key_rejected e id errado é model_not_found', async () => {
    harness.server.behavior = { kind: 'report' };
    expect((await call(harness.build({ apiKey: 'sk-test-OTHER' }))).status).toBe(
      MODEL_CALL_STATUS.KEY_REJECTED,
    );
    expect((await call(harness.build({ modelId: 'no-such-model' }))).status).toBe(
      MODEL_CALL_STATUS.MODEL_NOT_FOUND,
    );
  });

  test('tempo-limite, redirecionamento e servidor fora de ar não vazam nada e viram timeout/unavailable', async () => {
    harness.server.behavior = { kind: 'hang' };
    const quick = await call(harness.build(), { ...LIMITS, timeoutMilliseconds: 120 });
    expect(quick.status).toBe(MODEL_CALL_STATUS.TIMEOUT);
    const redirected = await callWith(harness, { kind: 'redirect' });
    expect(redirected.status).toBe(MODEL_CALL_STATUS.UNAVAILABLE);
    const dead = startFakeProvider({ kind, expectedKey: SENTINEL, expectedModel: MODEL });
    const deadUrl = dead.url;
    await dead.stop();
    const port =
      kind === FAKE_PROVIDER.ANTHROPIC
        ? createAnthropicProvider({ apiKey: SENTINEL, baseUrl: deadUrl, modelId: MODEL })
        : createOpenAiProvider({
            apiKey: SENTINEL,
            baseUrl: deadUrl,
            modelId: MODEL,
            reasoningEffort: 'low',
            maxThinkingTokens: 0,
          });
    expect((await call(port)).status).toBe(MODEL_CALL_STATUS.UNAVAILABLE);
  }, 15_000);

  test('a chave sentinela vai só no cabeçalho do pedido e não aparece em nenhum resultado', async () => {
    harness.server.requests.length = 0;
    const behaviors: readonly FakeBehavior[] = [
      { kind: 'report' },
      { kind: 'invalid_output' },
      { kind: 'refusal' },
      { kind: 'status', status: 429, retryAfterSeconds: 1 },
      { kind: 'status', status: 500 },
      { kind: 'status', status: 401 },
      { kind: 'redirect' },
    ];
    const results: ModelCallResult[] = [];
    for (const behavior of behaviors) results.push(await callWith(harness, behavior));
    expect(JSON.stringify(results)).not.toContain(SENTINEL);
    for (const request of harness.server.requests) {
      expect(request.body).not.toContain(SENTINEL);
      expect(request.path).not.toContain(SENTINEL);
      expect(Object.values(request.headers).some((value) => value.includes(SENTINEL))).toBe(true);
    }
  });
});

describe('forma do pedido de cada provedor', () => {
  test('Anthropic: ferramenta forçada, temperatura 0 e o teto de saída', async () => {
    const harness = createHarness(FAKE_PROVIDER.ANTHROPIC);
    await callWith(harness, { kind: 'report' });
    const sent = readSent<Record<string, unknown>>(harness);
    expect(sent['tool_choice']).toStrictEqual({ type: 'tool', name: 'report_team' });
    expect(sent['temperature']).toBe(0);
    expect(sent['max_tokens']).toBe(900);
    expect(harness.server.requests[0]?.headers['anthropic-version']).toBe('2023-06-01');
    await harness.server.stop();
  });

  test('Gemini: JSON com esquema, nível de raciocínio e teto que inclui o raciocínio', async () => {
    const harness = createHarness(FAKE_PROVIDER.GEMINI);
    await callWith(harness, { kind: 'report' });
    const sent = readSent<{ generationConfig: Record<string, unknown> }>(harness);
    expect(sent.generationConfig['responseMimeType']).toBe('application/json');
    expect(sent.generationConfig['thinkingConfig']).toStrictEqual({ thinkingLevel: 'low' });
    expect(sent.generationConfig['maxOutputTokens']).toBe(900 + THINKING_BUDGET);
    expect(JSON.stringify(sent.generationConfig['responseSchema'])).not.toContain('maxLength');
    await harness.server.stop();
  });

  test('OpenAI: Responses API, esquema estrito, esforço, store false e teto com raciocínio', async () => {
    const harness = createHarness(FAKE_PROVIDER.OPENAI);
    await callWith(harness, { kind: 'report' });
    const sent = readSent<{ text: { format: Record<string, unknown> } } & Record<string, unknown>>(
      harness,
    );
    expect(harness.server.requests[0]?.path).toBe('/v1/responses');
    expect(sent['store']).toBe(false);
    expect(sent['reasoning']).toStrictEqual({ effort: 'low' });
    expect(sent['max_output_tokens']).toBe(900 + THINKING_BUDGET);
    expect(sent.text.format['type']).toBe('json_schema');
    expect(sent.text.format['strict']).toBe(true);
    await harness.server.stop();
  });

  test('o esquema estrito tem additionalProperties false e todos os campos em required, sem maxLength', () => {
    const schema = buildTeamReportJsonSchema(SCHEMA_DIALECT.STRICT);
    const objects = collectObjectNodes(schema);
    expect(objects.length).toBe(4);
    for (const node of objects) {
      expect(node['additionalProperties']).toBe(false);
      expect(node['required']).toStrictEqual(Object.keys(node['properties'] as object));
    }
    expect(JSON.stringify(schema)).not.toMatch(/maxLength|minLength|pattern/u);
  });
});
