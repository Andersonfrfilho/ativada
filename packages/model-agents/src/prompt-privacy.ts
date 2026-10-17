// Copyright (c) 2026 Ada Technology. All rights reserved.
// RF09: varre o prompt PRONTO atrás de identificador, e-mail, saldo e chave fora da lista.
export const ALLOWED_PROMPT_KEYS: readonly string[] = [
  'symbol',
  'timeframe',
  'lastCandleCloseTime',
  'candles',
  'readings',
  'relativeVolume',
  'atrRate',
  'atrPercentile90',
  'atrPercentile95',
  'momentumShort',
  'momentumLong',
  'fearGreed',
  'value',
  'observedAt',
];

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const KEY_PATTERN = /"([A-Za-z0-9_]+)":/g;
const SENSITIVE_WORDS: readonly string[] = [
  'saldo',
  'balance',
  'equity',
  'userid',
  'email',
  'e-mail',
];

export const PROMPT_VIOLATION = {
  UUID: 'uuid',
  AT_SIGN: 'at_sign',
  UNKNOWN_KEY: 'unknown_key',
  SENSITIVE_WORD: 'sensitive_word',
} as const;

export function findPromptPrivacyViolations(prompt: string): readonly string[] {
  const violations: string[] = [];
  if (UUID_PATTERN.test(prompt)) violations.push(PROMPT_VIOLATION.UUID);
  if (prompt.includes('@')) violations.push(PROMPT_VIOLATION.AT_SIGN);
  const lowerPrompt = prompt.toLowerCase();
  for (const word of SENSITIVE_WORDS) {
    if (lowerPrompt.includes(word)) violations.push(`${PROMPT_VIOLATION.SENSITIVE_WORD}:${word}`);
  }
  for (const match of prompt.matchAll(KEY_PATTERN)) {
    const key = match[1] ?? '';
    if (!ALLOWED_PROMPT_KEYS.includes(key))
      violations.push(`${PROMPT_VIOLATION.UNKNOWN_KEY}:${key}`);
  }
  return violations;
}
