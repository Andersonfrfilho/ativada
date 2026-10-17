// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import { modelPromptInputSchema, type ModelPromptInput } from './prompt-input.schema.js';

// Mudar qualquer palavra do template exige `prompt-2`: a chave única das opiniões e o placar contam POR versão.
export const PROMPT_VERSION = 'prompt-1';

export const PROMPT_INSTRUCTION = [
  'Você é um analista de mercado de criptomoedas e lê apenas dados de velas de 15 minutos.',
  'Pergunta única: a próxima vela de 15 min do par fecha acima, abaixo ou sem opinião em relação ao fechamento da última vela?',
  'Responda só pelo formato pedido (ferramenta ou JSON) com os campos posture, reason e confidence.',
  'posture: up (fecha acima), down (fecha abaixo) ou neutral (sem leitura clara).',
  'reason: uma linha de até 160 caracteres, sem prometer nada e sem recomendar compra ou venda.',
  'confidence: inteiro de 0 a 100.',
  'Use neutral quando não houver leitura clara.',
  'Os dados vêm em JSON: candles = [abertura em ms UTC, abertura, máxima, mínima, fechamento, volume]; readings = leituras públicas; fearGreed = índice de 0 a 100 ou null.',
].join('\n');

// Bloco de dados em ordem fixa de chaves: a mesma entrada dá sempre o mesmo texto e o mesmo hash.
function buildDataBlock(input: ModelPromptInput): string {
  const { readings } = input;
  return JSON.stringify({
    symbol: input.symbol,
    timeframe: input.timeframe,
    lastCandleCloseTime: input.lastCandleCloseTime,
    candles: input.candles,
    readings: {
      relativeVolume: readings.relativeVolume,
      atrRate: readings.atrRate,
      atrPercentile90: readings.atrPercentile90,
      atrPercentile95: readings.atrPercentile95,
      momentumShort: readings.momentumShort,
      momentumLong: readings.momentumLong,
    },
    fearGreed: input.fearGreed,
  });
}

// Lança com entrada de chave de fora: o prompt só nasce de dado público de mercado (RF09).
export function renderPrompt(input: ModelPromptInput): string {
  const validInput = modelPromptInputSchema.parse(input);
  return `${PROMPT_INSTRUCTION}\n\nDADOS:\n${buildDataBlock(validInput)}`;
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}
