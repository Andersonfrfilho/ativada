// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamReport } from '../src/index.js';

export const FAKE_PROVIDER = {
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OPENAI: 'openai',
} as const;
export type FakeProviderKind = (typeof FAKE_PROVIDER)[keyof typeof FAKE_PROVIDER];

export type FakeUsage = {
  readonly input: number;
  readonly output: number;
  readonly thinking: number;
};

export const FAKE_DEFAULT_USAGE: FakeUsage = { input: 3_200, output: 450, thinking: 300 };

export const FAKE_BUY_REPORT: TeamReport = {
  trend: { stance: 'up', reason: 'três fechamentos acima da média' },
  risk: { level: 'medium', reason: 'volume perto da média' },
  decision: {
    action: 'buy',
    entryPrice: '100.00',
    targetPrice: '101.50',
    stopPrice: '99.40',
    confidence: 62,
    reason: 'retomada com risco medido',
  },
};

export const FAKE_HOLD_REPORT: TeamReport = {
  trend: { stance: 'neutral', reason: 'sem direção' },
  risk: { level: 'low', reason: 'mercado calmo' },
  decision: {
    action: 'hold',
    entryPrice: null,
    targetPrice: null,
    stopPrice: null,
    confidence: 40,
    reason: 'sem leitura clara',
  },
};

// Corpo de sucesso na forma de cada provedor (conferida em specs/015/evidence.md, T0.1 e T0.1b).
export function buildSuccessBody(
  kind: FakeProviderKind,
  report: unknown,
  usage: FakeUsage,
): unknown {
  if (kind === FAKE_PROVIDER.ANTHROPIC) {
    return {
      content: [{ type: 'tool_use', name: 'report_team', input: report }],
      stop_reason: 'tool_use',
      usage: { input_tokens: usage.input, output_tokens: usage.output },
    };
  }
  if (kind === FAKE_PROVIDER.GEMINI) {
    return {
      candidates: [
        { content: { parts: [{ text: JSON.stringify(report) }] }, finishReason: 'STOP' },
      ],
      usageMetadata: {
        promptTokenCount: usage.input,
        candidatesTokenCount: usage.output,
        thoughtsTokenCount: usage.thinking,
      },
    };
  }
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(report) }] }],
    usage: {
      input_tokens: usage.input,
      output_tokens: usage.output + usage.thinking,
      output_tokens_details: { reasoning_tokens: usage.thinking },
    },
  };
}

// Saída que não é JSON do relatório: o texto solto (ou, na Anthropic, uma ferramenta sem a entrada esperada).
export function buildInvalidBody(kind: FakeProviderKind, usage: FakeUsage): unknown {
  if (kind === FAKE_PROVIDER.ANTHROPIC) {
    return buildSuccessBody(kind, { not: 'a report' }, usage);
  }
  return patchText(kind, buildSuccessBody(kind, {}, usage), 'isto não é json');
}

function patchText(kind: FakeProviderKind, body: unknown, text: string): unknown {
  const copy: unknown = JSON.parse(JSON.stringify(body));
  if (kind === FAKE_PROVIDER.GEMINI) {
    const holder = copy as { candidates: { content: { parts: { text: string }[] } }[] };
    const part = holder.candidates[0]?.content.parts[0];
    if (part !== undefined) part.text = text;
    return copy;
  }
  const holder = copy as { output: { content: { text: string }[] }[] };
  const item = holder.output[0]?.content[0];
  if (item !== undefined) item.text = text;
  return copy;
}

export function buildRefusalBody(kind: FakeProviderKind, usage: FakeUsage): unknown {
  if (kind === FAKE_PROVIDER.ANTHROPIC) {
    return {
      content: [],
      stop_reason: 'refusal',
      usage: { input_tokens: usage.input, output_tokens: 0 },
    };
  }
  if (kind === FAKE_PROVIDER.GEMINI) {
    return {
      candidates: [{ finishReason: 'SAFETY' }],
      usageMetadata: { promptTokenCount: usage.input, candidatesTokenCount: 0 },
    };
  }
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'não posso ajudar' }] }],
    usage: { input_tokens: usage.input, output_tokens: 5 },
  };
}

// Estouro do teto de saída: `max_tokens` (Anthropic), `MAX_TOKENS` (Gemini) e `status: incomplete` (OpenAI, sem saída visível).
export function buildTruncatedBody(kind: FakeProviderKind, usage: FakeUsage): unknown {
  if (kind === FAKE_PROVIDER.ANTHROPIC) {
    return {
      content: [],
      stop_reason: 'max_tokens',
      usage: { input_tokens: usage.input, output_tokens: usage.output },
    };
  }
  if (kind === FAKE_PROVIDER.GEMINI) {
    return {
      candidates: [{ finishReason: 'MAX_TOKENS' }],
      usageMetadata: {
        promptTokenCount: usage.input,
        candidatesTokenCount: usage.output,
        thoughtsTokenCount: usage.thinking,
      },
    };
  }
  return {
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: [],
    usage: {
      input_tokens: usage.input,
      output_tokens: usage.output,
      output_tokens_details: { reasoning_tokens: usage.output },
    },
  };
}
