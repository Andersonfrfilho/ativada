// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CADENCE_TEXT, SIZE_TEXT } from './analyst.constant.js';
import type { DecidedAnalystDecision } from './analyst.validation.js';

export function cadenceText(decision: DecidedAnalystDecision): string {
  return CADENCE_TEXT[decision.cadenceMinutes];
}

export function sizeText(decision: DecidedAnalystDecision): string {
  return SIZE_TEXT[decision.riskScale] ?? decision.riskScale;
}

export function durationText(decision: DecidedAnalystDecision): string {
  return `até ${decision.maxTradeMinutes} min`;
}

// O motivo do servidor vem em minúsculas e sem ponto ("o RSI (78,2) está acima de 70"): a frase sai com maiúscula e ponto.
export function toSentence(text: string): string {
  const capitalized = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
