// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  divideFloor,
  formatScaled,
  formatSignedPercentDown,
  formatSignedScaled,
  multiplyDown,
  multiplyUp,
  parseScaled,
  roundScaledHalfUp,
} from '../../../format/decimal.js';

const ONE = 100_000_000n;
const ZERO = 0n;
const HALF = 50_000_000n;
const FIFTH = 20_000_000n;
const RATIO_PLACES = 1;
const PERCENT = 100n;
const BAR_DIVISOR = 1_000_000n;

export type CostRates = { readonly fee: bigint; readonly slippage: bigint };

export type CostParameters = {
  readonly feeRate?: string | undefined;
  readonly slippageRate?: string | undefined;
};

export type NetOutcome = {
  // Taxas como fração escalada (0,0076 = 0,76%): líquida de taxa e deslizamento e bruta (só os preços).
  readonly netRate: bigint;
  readonly grossRate: bigint;
  readonly netAmount: bigint;
};

export type NetInput = {
  readonly entry: bigint;
  readonly exit: bigint;
  readonly quantity: bigint;
  readonly costs: CostRates;
};

// Custo de ida e volta da simulação (taxa + deslizamento); sem os dois no pedido da execução, o painel não inventa número.
export function readCostRates(parameters: CostParameters): CostRates | undefined {
  const fee = parameters.feeRate === undefined ? undefined : parseScaled(parameters.feeRate);
  const slippage =
    parameters.slippageRate === undefined ? undefined : parseScaled(parameters.slippageRate);
  return fee === undefined || slippage === undefined ? undefined : { fee, slippage };
}

// Compra a entrada com deslizamento e taxa (o custo sobe), vende a saída com os dois (a receita desce): o líquido nunca
// parece melhor do que é. Ganho arredonda para baixo e perda para cima, porque a divisão e os produtos seguem esse sentido.
export function projectNet({ entry, exit, quantity, costs }: NetInput): NetOutcome | undefined {
  const unitCost = multiplyUp(multiplyUp(entry, ONE + costs.slippage), ONE + costs.fee);
  const unitProceeds = multiplyDown(multiplyDown(exit, ONE - costs.slippage), ONE - costs.fee);
  const netRate = divideFloor(unitProceeds - unitCost, unitCost);
  const grossRate = divideFloor(exit - entry, entry);
  if (netRate === undefined || grossRate === undefined) return undefined;
  return { netRate, grossRate, netAmount: multiplyDown(quantity, unitProceeds - unitCost) };
}

export type NetTone = 'gain' | 'loss' | 'flat';

export type NetText = {
  readonly percent: string;
  readonly gross: string;
  readonly amount: string;
  readonly tone: NetTone;
};

// O menos tipográfico (U+2212), como nas frases do servidor.
export function minusSign(text: string): string {
  return text.replace('-', '−');
}

export function toneOf(rate: bigint): NetTone {
  if (rate > ZERO) return 'gain';
  return rate < ZERO ? 'loss' : 'flat';
}

export function describeNet(outcome: NetOutcome): NetText {
  const { netRate, grossRate, netAmount } = outcome;
  return {
    percent: minusSign(formatSignedPercentDown(netRate)),
    gross: minusSign(formatSignedPercentDown(grossRate)),
    amount: `${minusSign(formatSignedScaled(netAmount))} USDT`,
    tone: toneOf(netRate),
  };
}

// Ganho ÷ risco: o que se ganha no alvo para cada 1 que se perde na proteção, já com custos (uma casa).
export function describeRatio(gain: NetOutcome, loss: NetOutcome): string | undefined {
  if (gain.netRate <= ZERO || loss.netRate >= ZERO) return undefined;
  const ratio = divideFloor(gain.netRate, -loss.netRate);
  if (ratio === undefined) return undefined;
  const rounded = roundScaledHalfUp(ratio, RATIO_PLACES);
  return formatScaled(rounded, { minimumFraction: 1, maximumFraction: 1 });
}

export type ProtectionLevel = 'far' | 'near' | 'veryNear';

export type ProtectionDistance = {
  readonly level: ProtectionLevel;
  // Quanto da folga entre a entrada e a proteção ainda resta (0 a 100), só para desenhar a barra.
  readonly remainingPercent: number;
  // Distância do preço de agora até a proteção, em % do preço de agora, com 2 casas.
  readonly gapText: string;
};

function levelOf(remaining: bigint): ProtectionLevel {
  if (remaining >= HALF) return 'far';
  return remaining >= FIFTH ? 'near' : 'veryNear';
}

// "longe" acima de 50% da folga, "perto" entre 20% e 50%, "muito perto" abaixo de 20%; preço sob a proteção vale 0.
export function measureProtection(
  entry: bigint,
  stop: bigint,
  price: bigint,
): ProtectionDistance | undefined {
  const slack = entry - stop;
  if (slack <= ZERO) return undefined;
  const remaining = divideFloor(price - stop, slack);
  const gap = divideFloor(price - stop, price);
  if (remaining === undefined || gap === undefined) return undefined;
  const clamped = remaining < ZERO ? ZERO : remaining > ONE ? ONE : remaining;
  const percent = roundScaledHalfUp(gap * PERCENT, 2);
  return {
    level: levelOf(remaining),
    remainingPercent: Number(clamped / BAR_DIVISOR),
    gapText: formatScaled(percent < ZERO ? ZERO : percent),
  };
}
