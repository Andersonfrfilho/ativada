// Copyright (c) 2026 Ada Technology. All rights reserved.
import { divideFloor, formatScaled, parseScaled, roundScaledDirected } from '../format/decimal.js';

// RF18: o aviso entra a 0,3% do limite e só sai além de 0,6% (histerese), ou quando a vela fecha. Tudo em BigInt de escala 8.
const NEAR_RATE = 300_000n;
const FAR_RATE = 600_000n;
const PERCENT_FACTOR = 100n;
const FULL = 100n;
const ZERO = 0n;

export type NearDirection = 'above' | 'below';

// A distância (em fração do preço atual) que falta para a regra de preço votar: o preço ao vivo ainda do lado de fora do limite.
export function computeNearDistance(params: {
  readonly direction: NearDirection;
  readonly threshold: string;
  readonly price: string;
}): bigint | undefined {
  const threshold = parseScaled(params.threshold);
  const price = parseScaled(params.price);
  if (threshold === undefined || price === undefined || price <= ZERO) return undefined;
  const gap = params.direction === 'below' ? price - threshold : threshold - price;
  return gap > ZERO ? divideFloor(gap, price) : undefined;
}

// Quem já estava "perto" só sai além de 0,6%; quem não estava só entra a 0,3% ou menos.
export function stepNear(wasNear: boolean, distance: bigint | undefined): boolean {
  if (distance === undefined) return false;
  return distance <= (wasNear ? FAR_RATE : NEAR_RATE);
}

// "falta 0,24%": a distância em % com 2 casas, arredondada para CIMA (nunca parece mais perto do que está).
export function formatNearDistance(distance: bigint): string {
  const rounded = roundScaledDirected(distance * PERCENT_FACTOR, 2, 'up');
  return formatScaled(rounded);
}

// A barra de progresso até a condição, em % inteiro: 0 na borda da histerese, 100 em cima do limite.
export function nearProgress(distance: bigint): bigint {
  const filled = FAR_RATE - (distance > FAR_RATE ? FAR_RATE : distance);
  return (filled * FULL) / FAR_RATE;
}
