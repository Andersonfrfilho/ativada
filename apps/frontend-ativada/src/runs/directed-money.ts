// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatScaled,
  formatSignedScaled,
  parseScaled,
  roundScaledDirected,
} from '../format/decimal.js';

const CENTS = 2;
const MISSING_TEXT = '—';

export type RoundingDirection = 'up' | 'down';

// Dinheiro em centavos arredondado contra o usuário, como o servidor: o que se paga e as taxas sobem; o que se recebe desce.
export function formatDirectedMoney(text: string, direction: RoundingDirection): string {
  const value = parseScaled(text);
  return value === undefined
    ? MISSING_TEXT
    : formatScaled(roundScaledDirected(value, CENTS, direction));
}

// O resultado desce sempre (ganho menor, perda maior), a mesma regra do saldo líquido do resumo.
export function formatDirectedResult(profit: bigint): string {
  return formatSignedScaled(roundScaledDirected(profit, CENTS, 'down'));
}
