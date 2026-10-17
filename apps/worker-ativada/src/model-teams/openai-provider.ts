// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import type { ModelCallResult } from '@ativada/model-agents';

import {
  completeCall,
  NO_USAGE,
  parseJsonText,
  type ModelProviderPort,
  type ParsedPayload,
} from './model-provider.port.js';
import { joinUrl, postJson } from './provider-http.js';
import { OPENAI_SCHEMA_NAME, type ReasoningLevel } from './model-teams.constant.js';
import { buildTeamReportJsonSchema, SCHEMA_DIALECT } from './team-report-json-schema.js';

export type OpenAiProviderSettings = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly modelId: string;
  readonly reasoningEffort: ReasoningLevel;
  // `max_output_tokens` INCLUI o raciocínio: o teto de raciocínio soma-se à saída.
  readonly maxThinkingTokens: number;
};

const STATUS_INCOMPLETE = 'incomplete';
const CONTENT_REFUSAL = 'refusal';
const CONTENT_TEXT = 'output_text';

const responseSchema = z.looseObject({
  status: z.string().optional(),
  output: z
    .array(
      z.looseObject({
        content: z
          .array(z.looseObject({ type: z.string(), text: z.string().optional() }))
          .optional(),
      }),
    )
    .optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      output_tokens_details: z
        .looseObject({ reasoning_tokens: z.number().int().nonnegative().optional() })
        .optional(),
    })
    .optional(),
});

function readUsage(usage: z.infer<typeof responseSchema>['usage']): ParsedPayload['usage'] {
  const thinkingTokens = usage?.output_tokens_details?.reasoning_tokens ?? 0;
  const totalOutput = usage?.output_tokens ?? 0;
  // O raciocínio já está dentro de `output_tokens`; o custo o soma de novo como saída, então ele sai daqui.
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: Math.max(0, totalOutput - thinkingTokens),
    thinkingTokens,
  };
}

function parseResponse(body: unknown): ParsedPayload {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { kind: 'invalid', usage: NO_USAGE };
  const usage = readUsage(parsed.data.usage);
  const items = (parsed.data.output ?? []).flatMap((entry) => entry.content ?? []);
  if (items.some((item) => item.type === CONTENT_REFUSAL)) return { kind: 'refused', usage };
  if (parsed.data.status === STATUS_INCOMPLETE) return { kind: 'invalid', usage };
  const text = items.find((item) => item.type === CONTENT_TEXT)?.text ?? '';
  return { kind: 'candidate', candidate: parseJsonText(text), usage };
}

// Responses API com `text.format` estrito, `reasoning.effort` do env e `store: false`.
export function createOpenAiProvider(settings: OpenAiProviderSettings): ModelProviderPort {
  return {
    requestTeamReport: async (params): Promise<ModelCallResult> => {
      const startedAt = performance.now();
      const outcome = await postJson({
        url: joinUrl(settings.baseUrl, '/v1/responses'),
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        body: {
          model: settings.modelId,
          input: params.prompt,
          store: false,
          max_output_tokens: params.limits.maxOutputTokens + settings.maxThinkingTokens,
          reasoning: { effort: settings.reasoningEffort },
          text: {
            format: {
              type: 'json_schema',
              name: OPENAI_SCHEMA_NAME,
              strict: true,
              schema: buildTeamReportJsonSchema(SCHEMA_DIALECT.STRICT),
            },
          },
        },
        timeoutMilliseconds: params.limits.timeoutMilliseconds,
        signal: params.signal,
      });
      return completeCall({
        outcome,
        latencyMilliseconds: Math.round(performance.now() - startedAt),
        parse: parseResponse,
      });
    },
  };
}
