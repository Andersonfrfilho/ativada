// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ModelTeamKey } from '../../model-teams/model-teams.constant.js';

// Espelho da regra da API (`POST /v1/runs/:runId/model-teams/:teamKey/questions`): de 3 a 280 caracteres, aparada.
export const TEAM_QUESTION_MIN_LENGTH = 3;
export const TEAM_QUESTION_MAX_LENGTH = 280;
export const TEAM_QUESTIONS_QUERY_PART = 'questions';
export const TEAM_QUESTION_STATUSES = ['pending', 'answered', 'failed', 'hidden'] as const;

// Para quem o texto vai, com o artigo (a frase do aviso diz "vai para a OpenAI").
export const TEAM_PROVIDER_COMPANY: Readonly<Record<ModelTeamKey, string>> = {
  nina: 'o Google',
  lucas: 'a Anthropic',
  olivia: 'a OpenAI',
};

export function fieldLabel(name: string): string {
  return `Pergunte à ${name} ◆`;
}

export function askButtonText(name: string): string {
  return `Perguntar à ${name}`;
}

export function thinkingText(name: string): string {
  return `${name} está pensando…`;
}

export function noticeText(params: { readonly name: string; readonly company: string }): string {
  return `Seu texto vai para ${params.company} (provedor da ${params.name}). Não escreva nome, e-mail, saldo ou dados pessoais. Gasta do teto diário. Não é recomendação.`;
}

export function counterText(length: number): string {
  return `${length} de ${TEAM_QUESTION_MAX_LENGTH} caracteres`;
}

export function voiceOfferText(params: { readonly name: string; readonly text: string }): string {
  return `Perguntar à ${params.name}: “${params.text}”`;
}

export const TEAM_QUESTION_TEXT = {
  PERSONAL_DATA:
    'Parece haver dado pessoal (e-mail, CPF, telefone, cartão ou número longo). Tire antes de enviar.',
  TOO_SHORT: 'Escreva pelo menos 3 caracteres.',
  LIMIT: 'Você usou as perguntas livres de hoje ou perguntou rápido demais. Tente mais tarde.',
  DISABLED: 'Esta equipe está desligada. Ligue-a em Conta para perguntar.',
  UNAVAILABLE: 'O provedor desta equipe está fora ou sem chave agora. Tente mais tarde.',
  INVALID: 'A pergunta precisa ter de 3 a 280 caracteres, sobre uma moeda habilitada.',
  GENERIC: 'Não foi possível enviar a pergunta agora. Tente de novo.',
} as const;

// O código do worker, em palavras (o painel nunca mostra o código cru).
const FAILURE_WORDS: Readonly<Record<string, string>> = {
  BUDGET_EXHAUSTED: 'O teto de custo do dia (ou do mês) acabou: a pergunta não foi enviada.',
  QUESTION_HAS_PERSONAL_DATA:
    'A pergunta parecia ter dado pessoal (e-mail, CPF, telefone, cartão ou número longo) e não foi enviada.',
  NO_KEY: 'A equipe está sem chave configurada: a pergunta não foi enviada.',
  KEY_REJECTED: 'O provedor recusou a chave da equipe: a pergunta não foi enviada.',
  MODEL_NOT_FOUND: 'O modelo da equipe não existe no provedor: a pergunta não foi enviada.',
  CIRCUIT_OPEN: 'O provedor está fora agora: a pergunta não foi enviada. Tente mais tarde.',
  UNAVAILABLE: 'O provedor está fora agora. Tente mais tarde.',
  TIMEOUT: 'O provedor demorou demais para responder. Tente mais tarde.',
  RATE_LIMITED: 'O provedor pediu um tempo. Tente mais tarde.',
  NO_INPUT: 'Ainda não há velas de 15 min gravadas desta moeda.',
  ATTEMPTS_EXHAUSTED: 'Não deu para responder depois de duas tentativas.',
};

export function describeQuestionFailure(code: string | null): string {
  const words = code === null ? undefined : FAILURE_WORDS[code];
  return words ?? 'A equipe não conseguiu responder a esta pergunta. Tente de outro jeito.';
}
