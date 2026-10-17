// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal } from '@ativada/strategy-engine';

import type { ModelTokenUsage } from './model-call-result.types.js';

// RNF06: dinheiro em texto decimal, sempre arredondado para CIMA a 8 casas; float nunca.
export const COST_DECIMAL_PLACES = 8;
export const TOKENS_PER_MEGA_TOKEN = 1_000_000;
// Conservador (D4): um token a cada 3 caracteres do prompt, para a reserva nunca ficar abaixo do gasto real.
export const CHARACTERS_PER_ESTIMATED_TOKEN = 3;

export type ModelPrice = {
  readonly inputUsdPerMegaToken: string;
  readonly outputUsdPerMegaToken: string;
};

export type ComputeCallCostParams = { readonly usage: ModelTokenUsage; readonly price: ModelPrice };

export type ComputeReservationParams = {
  readonly promptLength: number;
  readonly maxOutputTokens: number;
  readonly maxThinkingTokens: number;
  readonly price: ModelPrice;
};

function priceTokens(params: {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly price: ModelPrice;
}): string {
  const inputCost = new EngineDecimal(params.inputTokens).times(params.price.inputUsdPerMegaToken);
  const outputCost = new EngineDecimal(params.outputTokens).times(
    params.price.outputUsdPerMegaToken,
  );
  const cost = inputCost.plus(outputCost).dividedBy(TOKENS_PER_MEGA_TOKEN);
  return formatEngineDecimal(cost.toDecimalPlaces(COST_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL));
}

// custo = ceil8((entrada × preço de entrada + (saída + raciocínio) × preço de saída) ÷ 1.000.000); o raciocínio é saída.
export function computeCallCost(params: ComputeCallCostParams): string {
  const { usage, price } = params;
  return priceTokens({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens + usage.thinkingTokens,
    price,
  });
}

export function estimateInputTokens(promptLength: number): number {
  return Math.ceil(promptLength / CHARACTERS_PER_ESTIMATED_TOKEN);
}

// Reserva = o custo MÁXIMO da chamada: entrada estimada + saída máxima + teto do raciocínio, ao preço do env.
export function computeReservation(params: ComputeReservationParams): string {
  return priceTokens({
    inputTokens: estimateInputTokens(params.promptLength),
    outputTokens: params.maxOutputTokens + params.maxThinkingTokens,
    price: params.price,
  });
}
