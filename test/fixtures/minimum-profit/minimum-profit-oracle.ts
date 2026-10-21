// Copyright (c) 2026 Ada Technology. All rights reserved.
// Oráculo independente da regra `minimum-profit-1` (spec 013, ADR 0002 "Lucro mínimo por operação"): inteiros `bigint`
// sobre decimais exatos, sem importar `src` nem `decimal.js`. Um valor é `units / 10^scale`.

export type ExactDecimal = { readonly units: bigint; readonly scale: number };

export type MinimumProfitCase = {
  // O ATR de risco de `t` como o sinal o carrega (número do indicador).
  readonly atr: number;
  // Fechamento de `t`, texto exato da vela.
  readonly close: string;
  readonly targetAtrMultiple: string;
  readonly feeRate: string;
  readonly slippageRate: string;
  readonly minimumNetTargetRate: string;
};

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i;
// A mesma porta do float do indicador para o decimal do dinheiro (ADR 0002 §c): 15 algarismos significativos.
const INDICATOR_SIGNIFICANT_DIGITS = 15;
// 2 casas de porcentagem = 4 casas da fração.
const PERCENT_PLACES_IN_FRACTION = 4;
const TWO: ExactDecimal = { units: 2n, scale: 0 };

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

export function parseExact(text: string): ExactDecimal {
  const match = DECIMAL_PATTERN.exec(text);
  if (match === null) throw new Error(`Decimal inválido: ${text}`);
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] ?? '';
  const digits = BigInt(`${match[2] ?? '0'}${fraction}`) * sign;
  const scale = fraction.length - Number(match[4] ?? '0');
  return scale >= 0 ? { units: digits, scale } : { units: digits * pow10(-scale), scale: 0 };
}

export function atrFromIndicator(atr: number): ExactDecimal {
  if (!Number.isFinite(atr)) throw new Error('ATR não finito.');
  return parseExact(atr.toPrecision(INDICATOR_SIGNIFICANT_DIGITS));
}

function unitsAt(value: ExactDecimal, scale: number): bigint {
  return value.units * pow10(scale - value.scale);
}

function add(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  const scale = Math.max(left.scale, right.scale);
  return { units: unitsAt(left, scale) + unitsAt(right, scale), scale };
}

function multiply(left: ExactDecimal, right: ExactDecimal): ExactDecimal {
  return { units: left.units * right.units, scale: left.scale + right.scale };
}

export function compareExact(left: ExactDecimal, right: ExactDecimal): number {
  const scale = Math.max(left.scale, right.scale);
  const difference = unitsAt(left, scale) - unitsAt(right, scale);
  return difference === 0n ? 0 : difference > 0n ? 1 : -1;
}

// Custo de ida e volta = 2 × (taxa + slippage), exato.
export function roundTripCostRate(feeRate: string, slippageRate: string): ExactDecimal {
  return multiply(TWO, add(parseExact(feeRate), parseExact(slippageRate)));
}

function targetDistance(input: MinimumProfitCase): ExactDecimal {
  return multiply(parseExact(input.targetAtrMultiple), atrFromIndicator(input.atr));
}

// Passa quando m × ATR ≥ (mínimo + custo) × fechamento: nenhuma divisão, nenhum arredondamento; igual passa.
export function isEntryAllowed(input: MinimumProfitCase): boolean {
  const required = add(
    parseExact(input.minimumNetTargetRate),
    roundTripCostRate(input.feeRate, input.slippageRate),
  );
  return compareExact(targetDistance(input), multiply(required, parseExact(input.close))) >= 0;
}

function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator !== 0n && numerator < 0n ? quotient - 1n : quotient;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return -floorDivide(-numerator, denominator);
}

// Ganho bruto no alvo (m × ATR ÷ fechamento) em centésimos de ponto percentual, para BAIXO.
export function grossTargetHundredthsDown(input: MinimumProfitCase): bigint {
  const target = targetDistance(input);
  const close = parseExact(input.close);
  const numerator = target.units * pow10(close.scale + PERCENT_PLACES_IN_FRACTION);
  return floorDivide(numerator, close.units * pow10(target.scale));
}

// Uma taxa em fração (até 8 casas) em centésimos de ponto percentual, para CIMA.
export function rateHundredthsUp(rate: ExactDecimal): bigint {
  return ceilDivide(rate.units * pow10(PERCENT_PLACES_IN_FRACTION), pow10(rate.scale));
}

// O ganho líquido no alvo a 12 casas, com o bruto cortado para BAIXO: a forma de texto que o motor expõe.
export function netTargetRateAt12(input: MinimumProfitCase): ExactDecimal {
  const target = targetDistance(input);
  const close = parseExact(input.close);
  const gross = floorDivide(
    target.units * pow10(close.scale + 12),
    close.units * pow10(target.scale),
  );
  const cost = roundTripCostRate(input.feeRate, input.slippageRate);
  return add({ units: gross, scale: 12 }, { units: -cost.units, scale: cost.scale });
}

const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;

// pt-BR com 2 casas: "0,66", "1.234,50".
export function formatHundredths(hundredths: bigint): string {
  const text = hundredths.toString().padStart(3, '0');
  const integer = text.slice(0, -2).replace(THOUSANDS_PATTERN, '.');
  return `${integer},${text.slice(-2)}`;
}

export const MINIMUM_PROFIT_MESSAGE_WITHOUT_NUMBERS =
  'Esperou: o ganho possível até o alvo não pagava o custo mais o lucro mínimo.';

// A frase fechada da vela barrada (spec 013 RF07): X para baixo, Y e Z para cima; mínimo zero tira o "mais".
export function minimumProfitMessage(input: MinimumProfitCase): string {
  const gross = formatHundredths(grossTargetHundredthsDown(input));
  const cost = formatHundredths(
    rateHundredthsUp(roundTripCostRate(input.feeRate, input.slippageRate)),
  );
  const minimum = parseExact(input.minimumNetTargetRate);
  const lead = `Esperou: o ganho possível até o alvo (${gross}%) não paga o custo de ida e volta (${cost}%)`;
  if (minimum.units === 0n) return `${lead}.`;
  return `${lead} mais o lucro mínimo que você pediu (${formatHundredths(rateHundredthsUp(minimum))}%).`;
}

// A linha da vela com a recusa gravada: sem leitura de ATR, ou se a conta refeita não barraria, a frase vai sem números.
export function describeMinimumProfitWait(input: MinimumProfitCase | undefined): string {
  if (input === undefined || isEntryAllowed(input)) return MINIMUM_PROFIT_MESSAGE_WITHOUT_NUMBERS;
  return minimumProfitMessage(input);
}
