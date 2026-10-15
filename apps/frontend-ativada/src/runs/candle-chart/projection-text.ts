// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatScaled, parseScaled, toPlainText } from '../../format/decimal.js';
import type { ProjectionItem } from './projections.validation.js';

// Palavras da tela para o que o servidor devolve em código. Os números e as frases longas vêm prontos do servidor (P9).
export const STRENGTH_WORD = { weak: 'fraco', strong: 'forte', decided: 'decidiu' } as const;
export const SIDE_WORD = { buy: 'Comprar', sell: 'Vender', none: 'Sem lado' } as const;

const PERCENT_FACTOR = 100n;
const ZERO = 0n;
const NO_VALUE = '—';
// O que conta como resultado recente: a previsão da vela que acabou de fechar (a primeira da lista é a da vela em curso).
const RECENT_ITEMS = 2;

// "0.4942" vira "49,42%": só desloca a vírgula em BigInt, sem arredondar de novo o que o servidor já cortou.
export function formatRatePercent(rate: string | null): string {
  const scaled = rate === null ? undefined : parseScaled(rate);
  if (scaled === undefined) return NO_VALUE;
  return `${formatScaled(scaled * PERCENT_FACTOR)}%`;
}

// O mesmo valor como número de atributo SVG ("49.00000000" para "0.49"); só para a largura de uma barra.
export function ratePercentAttribute(rate: string | null): string {
  const scaled = rate === null ? undefined : parseScaled(rate);
  return scaled === undefined ? '0' : toPlainText(scaled * PERCENT_FACTOR);
}

export type ResultTone = 'hit' | 'miss' | 'tie';
export type ResultView = {
  readonly tone: ResultTone;
  readonly word: string;
  readonly text: string;
};

function describeMove(item: ProjectionItem): string | undefined {
  const rate = item.moveRate === null ? undefined : parseScaled(item.moveRate);
  if (rate === undefined) return undefined;
  const verb = rate < ZERO ? 'caiu' : 'subiu';
  const magnitude = rate < ZERO ? -rate : rate;
  return `o preço ${verb} ${formatScaled(magnitude * PERCENT_FACTOR)}%`;
}

function describeBand(item: ProjectionItem): string | undefined {
  if (item.isInside === null) return undefined;
  return item.isInside ? 'ficou dentro da faixa' : 'ficou fora da faixa';
}

// O resultado da previsão de uma vela que fechou (RF17): "Acertou: o preço subiu 0,27% — ficou dentro da faixa."
export function describeResult(item: ProjectionItem): ResultView | undefined {
  if (item.result === 'tie') {
    return {
      tone: 'tie',
      word: 'Empatou',
      text: 'Empatou: o preço fechou igual e esta previsão não conta.',
    };
  }
  if (item.result !== 'hit' && item.result !== 'miss') return undefined;
  const word = item.result === 'hit' ? 'Acertou' : 'Errou';
  const parts = [describeMove(item), describeBand(item)].filter((part) => part !== undefined);
  const detail = parts.length === 0 ? '' : `: ${parts.join(' — ')}`;
  return { tone: item.result, word, text: `${word}${detail}.` };
}

// A previsão mais recente que já tem resultado, olhando só as duas primeiras da lista (mais novas primeiro).
export function findRecentResult(items: readonly ProjectionItem[]): ResultView | undefined {
  for (const item of items.slice(0, RECENT_ITEMS)) {
    const view = describeResult(item);
    if (view !== undefined) return view;
  }
  return undefined;
}
