// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import { teamPromptInputSchema, type TeamPromptInput } from './team-prompt-input.schema.js';

// Mudar qualquer palavra do template exige `team-prompt-2`: a chave única dos relatórios e o placar contam POR versão.
export const PROMPT_VERSION = 'team-prompt-1';

export const PROMPT_INSTRUCTION = [
  'Você é uma equipe de três papéis: analista de tendência, analista de risco e gestor. Leia só os dados de velas de 15 minutos abaixo.',
  'Pergunta única ao gestor: a próxima vela de 15 min do par é uma boa entrada de compra (buy), pede sair ou ficar fora (sell) ou esperar (hold)?',
  'Responda só pelo formato pedido (ferramenta ou JSON) com os campos trend, risk e decision.',
  'trend: stance (up, down ou neutral) e reason. risk: level (low, medium ou high) e reason.',
  'decision: action (buy, sell ou hold), entryPrice, targetPrice, stopPrice, confidence (inteiro de 0 a 100) e reason.',
  'buy exige os três preços em texto decimal, com stopPrice < entryPrice < targetPrice e entryPrice perto do último fechamento. sell e hold exigem os três preços nulos (null).',
  'Cada reason tem uma linha de até 160 caracteres, sem prometer nada e sem recomendar compra ou venda.',
  'Use hold quando não houver leitura clara.',
  'Os dados vêm em JSON: candles = [abertura em ms UTC, abertura, máxima, mínima, fechamento, volume]; readings = leituras públicas; fearGreed = índice de 0 a 100 ou null.',
].join('\n');

// Bloco de dados em ordem fixa de chaves: a mesma entrada dá sempre o mesmo texto e o mesmo hash.
export function buildPromptDataBlock(input: TeamPromptInput): string {
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
export function renderPrompt(input: TeamPromptInput): string {
  const validInput = teamPromptInputSchema.parse(input);
  return `${PROMPT_INSTRUCTION}\n\nDADOS:\n${buildPromptDataBlock(validInput)}`;
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex');
}
