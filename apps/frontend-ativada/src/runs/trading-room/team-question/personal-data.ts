// Copyright (c) 2026 Ada Technology. All rights reserved.

// Aviso ANTES de enviar: espelho das regras do worker (`findQuestionPersonalData`, pacote `model-agents`), que recusa a
// pergunta com dado pessoal sem chamar o provedor. O painel não importa código de outra app, então os padrões vivem aqui.
const PERSONAL_DATA_PATTERNS: readonly RegExp[] = [
  /\S+@\S+/u,
  /\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b|\b\d{3}\s\d{3}\s\d{3}\s?\d{2}\b/u,
  /\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]\d{4}\b/u,
  /\b(?:\d{4}[\s-]){3}\d{1,7}\b/u,
  /\d{10,}/u,
];

export function hasPersonalData(text: string): boolean {
  return PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(text));
}
