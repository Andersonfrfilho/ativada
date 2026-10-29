// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import type { FreeTextCallResult, ModelCallResult } from '@ativada/model-agents';

import { completeFreeText, type ParsedText } from './free-text-call.js';
import {
  completeCall,
  NO_USAGE,
  type ModelProviderPort,
  type ParsedPayload,
} from './model-provider.port.js';
import { joinUrl, postJson } from './provider-http.js';
import { ANTHROPIC_TOOL_NAME, ANTHROPIC_VERSION_HEADER_VALUE } from './model-teams.constant.js';
import { buildTeamReportJsonSchema, SCHEMA_DIALECT } from './team-report-json-schema.js';

export type AnthropicProviderSettings = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly modelId: string;
};

const STOP_REASON_REFUSAL = 'refusal';
const STOP_REASON_MAX_TOKENS = 'max_tokens';
const BLOCK_TOOL_USE = 'tool_use';
const BLOCK_TEXT = 'text';

const responseSchema = z.looseObject({
  content: z.array(
    z.looseObject({
      type: z.string(),
      name: z.string().optional(),
      input: z.unknown().optional(),
      text: z.string().optional(),
    }),
  ),
  stop_reason: z.string().nullable().optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

function parseResponse(body: unknown): ParsedPayload {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { kind: 'invalid', usage: NO_USAGE };
  const { content, stop_reason: stopReason, usage } = parsed.data;
  const tokens = {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    thinkingTokens: 0,
  };
  if (stopReason === STOP_REASON_REFUSAL) return { kind: 'refused', usage: tokens };
  if (stopReason === STOP_REASON_MAX_TOKENS) return { kind: 'invalid', usage: tokens };
  const block = content.find(
    (item) => item.type === BLOCK_TOOL_USE && item.name === ANTHROPIC_TOOL_NAME,
  );
  if (block === undefined) return { kind: 'invalid', usage: tokens };
  return { kind: 'candidate', candidate: block.input, usage: tokens };
}

// Modo texto (pergunta livre): os blocos `text`, juntos.
function parseTextResponse(body: unknown): ParsedText {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { kind: 'invalid', usage: NO_USAGE };
  const { content, stop_reason: stopReason, usage } = parsed.data;
  const tokens = {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    thinkingTokens: 0,
  };
  if (stopReason === STOP_REASON_REFUSAL) return { kind: 'refused', usage: tokens };
  if (stopReason === STOP_REASON_MAX_TOKENS) return { kind: 'invalid', usage: tokens };
  const text = content
    .filter((item) => item.type === BLOCK_TEXT)
    .map((item) => item.text ?? '')
    .join('');
  return { kind: 'text', text, usage: tokens };
}

type CallParams = Parameters<ModelProviderPort['requestTeamReport']>[0];

function post(
  settings: AnthropicProviderSettings,
  params: CallParams,
  extra: Record<string, unknown>,
): ReturnType<typeof postJson> {
  return postJson({
    url: joinUrl(settings.baseUrl, '/v1/messages'),
    headers: { 'x-api-key': settings.apiKey, 'anthropic-version': ANTHROPIC_VERSION_HEADER_VALUE },
    body: {
      model: settings.modelId,
      max_tokens: params.limits.maxOutputTokens,
      temperature: 0,
      messages: [{ role: 'user', content: params.prompt }],
      ...extra,
    },
    timeoutMilliseconds: params.limits.timeoutMilliseconds,
    signal: params.signal,
  });
}

const REPORT_TOOL = {
  tools: [
    {
      name: ANTHROPIC_TOOL_NAME,
      description: 'Entrega o relatório da equipe.',
      input_schema: buildTeamReportJsonSchema(SCHEMA_DIALECT.STRICT),
    },
  ],
  tool_choice: { type: 'tool', name: ANTHROPIC_TOOL_NAME },
} as const;

// Saída por ferramenta forçada (`tool_choice`): sem raciocínio estendido, que a forma forçada não admite. Temperatura 0. A
// pergunta livre vai sem ferramenta e volta em texto.
export function createAnthropicProvider(settings: AnthropicProviderSettings): ModelProviderPort {
  return {
    requestTeamReport: async (params): Promise<ModelCallResult> => {
      const startedAt = performance.now();
      const outcome = await post(settings, params, REPORT_TOOL);
      return completeCall({
        outcome,
        latencyMilliseconds: Math.round(performance.now() - startedAt),
        parse: parseResponse,
      });
    },
    requestFreeText: async (params): Promise<FreeTextCallResult> => {
      const startedAt = performance.now();
      const outcome = await post(settings, params, {});
      return completeFreeText({
        outcome,
        latencyMilliseconds: Math.round(performance.now() - startedAt),
        parse: parseTextResponse,
      });
    },
  };
}
