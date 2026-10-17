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
import type { ReasoningLevel } from './model-teams.constant.js';
import { buildTeamReportJsonSchema, SCHEMA_DIALECT } from './team-report-json-schema.js';

export type GeminiProviderSettings = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly modelId: string;
  readonly thinkingLevel: ReasoningLevel;
  // Soma-se à saída: o raciocínio é cobrado como saída e conta no teto de tokens.
  readonly maxThinkingTokens: number;
};

const FINISH_MAX_TOKENS = 'MAX_TOKENS';
const REFUSAL_FINISH_REASONS: readonly string[] = [
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
];

const responseSchema = z.looseObject({
  candidates: z
    .array(
      z.looseObject({
        content: z
          .looseObject({
            parts: z
              .array(
                z.looseObject({ text: z.string().optional(), thought: z.boolean().optional() }),
              )
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.looseObject({ blockReason: z.string().optional() }).optional(),
  usageMetadata: z
    .looseObject({
      promptTokenCount: z.number().int().nonnegative().optional(),
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      thoughtsTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

function parseResponse(body: unknown): ParsedPayload {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { kind: 'invalid', usage: NO_USAGE };
  const { candidates, promptFeedback, usageMetadata } = parsed.data;
  const usage = {
    inputTokens: usageMetadata?.promptTokenCount ?? 0,
    outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    thinkingTokens: usageMetadata?.thoughtsTokenCount ?? 0,
  };
  const first = candidates?.[0];
  const finishReason = first?.finishReason;
  const isBlocked =
    promptFeedback?.blockReason !== undefined ||
    (finishReason !== undefined && REFUSAL_FINISH_REASONS.includes(finishReason));
  if (isBlocked) return { kind: 'refused', usage };
  if (finishReason === FINISH_MAX_TOKENS) return { kind: 'invalid', usage };
  const text = (first?.content?.parts ?? [])
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? '')
    .join('');
  return { kind: 'candidate', candidate: parseJsonText(text), usage };
}

// `generateContent` com `responseMimeType: application/json` + `responseSchema`; o nível de raciocínio vem do env.
export function createGeminiProvider(settings: GeminiProviderSettings): ModelProviderPort {
  return {
    requestTeamReport: async (params): Promise<ModelCallResult> => {
      const startedAt = performance.now();
      const outcome = await postJson({
        url: joinUrl(settings.baseUrl, `/v1beta/models/${settings.modelId}:generateContent`),
        headers: { 'x-goog-api-key': settings.apiKey },
        body: {
          contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: buildTeamReportJsonSchema(SCHEMA_DIALECT.GEMINI),
            maxOutputTokens: params.limits.maxOutputTokens + settings.maxThinkingTokens,
            thinkingConfig: { thinkingLevel: settings.thinkingLevel },
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
