// Copyright (c) 2026 Ada Technology. All rights reserved.
export const MODEL_AGENT_KEY = {
  NINA: 'nina',
  LUCAS: 'lucas',
  CLARA: 'clara',
} as const;
export type ModelAgentKey = (typeof MODEL_AGENT_KEY)[keyof typeof MODEL_AGENT_KEY];

export const MODEL_PROVIDER = {
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
} as const;
export type ModelProvider = (typeof MODEL_PROVIDER)[keyof typeof MODEL_PROVIDER];

export const MODEL_AGENT_ROLE = 'Analista de modelo';

export type ModelAgentDefinition = {
  readonly key: ModelAgentKey;
  readonly displayName: string;
  readonly provider: ModelProvider;
  readonly modelFamily: string;
  readonly cloudLabel: string;
};

// Catálogo fechado (D1): o id do modelo e o preço de cada agente vêm do env, nunca daqui.
export const MODEL_AGENTS: Readonly<Record<ModelAgentKey, ModelAgentDefinition>> = {
  nina: {
    key: 'nina',
    displayName: 'Nina',
    provider: MODEL_PROVIDER.GOOGLE,
    modelFamily: 'Gemini Pro',
    cloudLabel: 'nuvem do Google',
  },
  lucas: {
    key: 'lucas',
    displayName: 'Lucas',
    provider: MODEL_PROVIDER.ANTHROPIC,
    modelFamily: 'Claude Sonnet',
    cloudLabel: 'nuvem da Anthropic',
  },
  clara: {
    key: 'clara',
    displayName: 'Clara',
    provider: MODEL_PROVIDER.ANTHROPIC,
    modelFamily: 'Claude Haiku',
    cloudLabel: 'nuvem da Anthropic',
  },
};

export const MODEL_AGENT_KEYS: readonly ModelAgentKey[] = [
  MODEL_AGENT_KEY.NINA,
  MODEL_AGENT_KEY.LUCAS,
  MODEL_AGENT_KEY.CLARA,
];

export function isModelAgentKey(value: unknown): value is ModelAgentKey {
  return MODEL_AGENT_KEYS.some((key) => key === value);
}
