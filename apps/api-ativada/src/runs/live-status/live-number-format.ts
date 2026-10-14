// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  ROUNDING_DIRECTION,
  toEngineDecimal,
  type EngineDecimalValue,
  type RoundingDirection,
} from '@ativada/strategy-engine';

import { PERCENT_MULTIPLIER } from './live-status.constant.js';

export const MINUS_SIGN = '−';
const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;
const MONEY_DECIMAL_PLACES = 2;
const PERCENT_DECIMAL_PLACES = 2;
const PRICE_MINIMUM_DECIMAL_PLACES = 2;
const READING_DECIMAL_PLACES = 1;

type BrazilianTextOptions = {
  readonly minimumFractionDigits: number;
  readonly shouldGroupThousands: boolean;
};

// pt-BR sem `Intl` (a saída do servidor não depende de locale): vírgula decimal, ponto de milhar e o menos tipográfico.
function toBrazilianText(value: EngineDecimalValue, options: BrazilianTextOptions): string {
  const [integer = '0', fraction = ''] = value.abs().toFixed().split('.');
  const grouped = options.shouldGroupThousands ? integer.replace(THOUSANDS_PATTERN, '.') : integer;
  const digits = fraction.padEnd(options.minimumFractionDigits, '0');
  const sign = value.isNegative() && !value.isZero() ? MINUS_SIGN : '';
  return `${sign}${grouped}${digits === '' ? '' : `,${digits}`}`;
}

function roundTo(
  value: EngineDecimalValue,
  places: number,
  direction: RoundingDirection,
): EngineDecimalValue {
  const mode =
    direction === ROUNDING_DIRECTION.UP ? EngineDecimal.ROUND_CEIL : EngineDecimal.ROUND_FLOOR;
  return value.toDecimalPlaces(places, mode);
}

// Dinheiro com 2 casas; a direção é a do campo (o que o usuário recebe desce, o que ele paga ou falta sobe).
export function formatAmount(text: string, direction: RoundingDirection): string {
  return toBrazilianText(roundTo(toEngineDecimal(text), MONEY_DECIMAL_PLACES, direction), {
    minimumFractionDigits: MONEY_DECIMAL_PLACES,
    shouldGroupThousands: true,
  });
}

// A taxa em fração ("0.0234") exibida em porcentagem com 2 casas ("2,34").
export function formatRatePercent(rateText: string, direction: RoundingDirection): string {
  const percent = toEngineDecimal(rateText).times(PERCENT_MULTIPLIER);
  return toBrazilianText(roundTo(percent, PERCENT_DECIMAL_PLACES, direction), {
    minimumFractionDigits: PERCENT_DECIMAL_PLACES,
    shouldGroupThousands: true,
  });
}

// Porcentagem de uma distância ("faltam 3,3%"): 2 casas no máximo, sem zeros à direita, sempre para o lado de quem espera.
export function formatDistancePercent(rateText: string): string {
  const percent = toEngineDecimal(rateText).times(PERCENT_MULTIPLIER);
  return toBrazilianText(roundTo(percent, PERCENT_DECIMAL_PLACES, ROUNDING_DIRECTION.UP), {
    minimumFractionDigits: 0,
    shouldGroupThousands: true,
  });
}

// Pontos do placar e limiares: o número exato, sem zeros à direita ("1", "−2", "0,5").
export function formatPoints(text: string): string {
  return toBrazilianText(toEngineDecimal(text), {
    minimumFractionDigits: 0,
    shouldGroupThousands: false,
  });
}

// Preço ou limiar de preço exatamente como veio, com ao menos 2 casas ("11,80").
export function formatPrice(text: string): string {
  return toBrazilianText(toEngineDecimal(text), {
    minimumFractionDigits: PRICE_MINIMUM_DECIMAL_PLACES,
    shouldGroupThousands: true,
  });
}

// Leitura de indicador (RSI, Fear & Greed) para a frase: 1 casa no máximo.
export function formatReading(value: number): string {
  return toBrazilianText(new EngineDecimal(value).toDecimalPlaces(READING_DECIMAL_PLACES), {
    minimumFractionDigits: 0,
    shouldGroupThousands: false,
  });
}

// "ponto" com exatamente 1 e "pontos" nos demais (inclusive 0,5 e 2).
export function pluralizePoints(text: string): string {
  return toEngineDecimal(text).equals(1) ? 'ponto' : 'pontos';
}

// "A", "A e B", "A, B e C".
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`;
}

// Uma taxa em fração exibida em porcentagem, exatamente como o usuário a digitou ("0.035" vira "3,5").
export function formatExactPercent(rateText: string): string {
  return toBrazilianText(toEngineDecimal(rateText).times(PERCENT_MULTIPLIER), {
    minimumFractionDigits: 0,
    shouldGroupThousands: false,
  });
}
