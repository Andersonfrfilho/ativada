// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MODEL_PROVIDER,
  MODEL_TEAM_KEY,
  type ModelPrice,
  type ModelProvider,
  type ModelTeamKey,
} from '@ativada/model-agents';

import { createAnthropicProvider } from './anthropic-provider.js';
import { createGeminiProvider } from './gemini-provider.js';
import type { ModelTeamEnvironment } from './model-team-environment.js';
import type { ModelProviderPort } from './model-provider.port.js';
import { createOpenAiProvider } from './openai-provider.js';

// Uma equipe com chave configurada: a porta do provedor, o id do modelo e o preço (tudo do env; nada presumido no código).
export type TeamRuntime = {
  readonly teamKey: ModelTeamKey;
  readonly provider: ModelProvider;
  readonly modelId: string;
  readonly price: ModelPrice;
  readonly maxThinkingTokens: number;
  readonly port: ModelProviderPort;
};

function buildLucas(environment: ModelTeamEnvironment): TeamRuntime | undefined {
  const apiKey = environment.ANTHROPIC_API_KEY;
  const modelId = environment.MODEL_TEAM_LUCAS_MODEL;
  const input = environment.MODEL_TEAM_LUCAS_INPUT_USD_PER_MTOK;
  const output = environment.MODEL_TEAM_LUCAS_OUTPUT_USD_PER_MTOK;
  if (
    apiKey === undefined ||
    modelId === undefined ||
    input === undefined ||
    output === undefined
  ) {
    return undefined;
  }
  return {
    teamKey: MODEL_TEAM_KEY.LUCAS,
    provider: MODEL_PROVIDER.ANTHROPIC,
    modelId,
    price: { inputUsdPerMegaToken: input, outputUsdPerMegaToken: output },
    maxThinkingTokens: 0,
    port: createAnthropicProvider({ apiKey, baseUrl: environment.ANTHROPIC_BASE_URL, modelId }),
  };
}

function buildNina(environment: ModelTeamEnvironment): TeamRuntime | undefined {
  const apiKey = environment.GEMINI_API_KEY;
  const modelId = environment.MODEL_TEAM_NINA_MODEL;
  const input = environment.MODEL_TEAM_NINA_INPUT_USD_PER_MTOK;
  const output = environment.MODEL_TEAM_NINA_OUTPUT_USD_PER_MTOK;
  if (
    apiKey === undefined ||
    modelId === undefined ||
    input === undefined ||
    output === undefined
  ) {
    return undefined;
  }
  const maxThinkingTokens = environment.MODEL_TEAM_NINA_MAX_THINKING_TOKENS;
  return {
    teamKey: MODEL_TEAM_KEY.NINA,
    provider: MODEL_PROVIDER.GOOGLE,
    modelId,
    price: { inputUsdPerMegaToken: input, outputUsdPerMegaToken: output },
    maxThinkingTokens,
    port: createGeminiProvider({
      apiKey,
      baseUrl: environment.GEMINI_BASE_URL,
      modelId,
      thinkingLevel: environment.MODEL_TEAM_NINA_THINKING_LEVEL,
      maxThinkingTokens,
    }),
  };
}

function buildOlivia(environment: ModelTeamEnvironment): TeamRuntime | undefined {
  const apiKey = environment.OPENAI_API_KEY;
  const modelId = environment.MODEL_TEAM_OLIVIA_MODEL;
  const input = environment.MODEL_TEAM_OLIVIA_INPUT_USD_PER_MTOK;
  const output = environment.MODEL_TEAM_OLIVIA_OUTPUT_USD_PER_MTOK;
  if (
    apiKey === undefined ||
    modelId === undefined ||
    input === undefined ||
    output === undefined
  ) {
    return undefined;
  }
  const maxThinkingTokens = environment.MODEL_TEAM_OLIVIA_MAX_THINKING_TOKENS;
  return {
    teamKey: MODEL_TEAM_KEY.OLIVIA,
    provider: MODEL_PROVIDER.OPENAI,
    modelId,
    price: { inputUsdPerMegaToken: input, outputUsdPerMegaToken: output },
    maxThinkingTokens,
    port: createOpenAiProvider({
      apiKey,
      baseUrl: environment.OPENAI_BASE_URL,
      modelId,
      reasoningEffort: environment.MODEL_TEAM_OLIVIA_REASONING_EFFORT,
      maxThinkingTokens,
    }),
  };
}

// Chave ausente = equipe desligada, SEM erro (RF04); o env já garantiu id e preço para quem tem chave.
export function buildTeamRuntimes(environment: ModelTeamEnvironment): readonly TeamRuntime[] {
  return [buildNina(environment), buildLucas(environment), buildOlivia(environment)].filter(
    (runtime): runtime is TeamRuntime => runtime !== undefined,
  );
}
