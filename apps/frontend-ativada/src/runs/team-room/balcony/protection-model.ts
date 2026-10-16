// Copyright (c) 2026 Ada Technology. All rights reserved.
import { divideFloor, formatSignedPercentDown, parseScaled } from '../../../format/decimal.js';
import { formatPriceAtTick } from '../../../notices/symbol-filters.js';
import type { LiveStatus } from '../../live-tracking/live-status.validation.js';
import {
  describeNet,
  measureProtection,
  minusSign,
  projectNet,
  type CostRates,
  type NetText,
  type ProtectionDistance,
} from './protection-math.js';

export type ProtectionView = {
  readonly entryPrice: string;
  readonly stopPrice: string;
  readonly targetPrice: string;
  readonly stopNet: NetText | undefined;
  readonly targetNet: NetText | undefined;
  // A queda da entrada até a proteção, bruta (só os preços), arredondada para o lado da perda.
  readonly fallFromEntry: string | undefined;
  readonly distance: ProtectionDistance | undefined;
};

export type ProtectionInput = {
  readonly symbol: string;
  readonly position: NonNullable<LiveStatus['openPosition']>;
  readonly costs: CostRates | undefined;
  readonly currentPrice: string | undefined;
};

type NetAtInput = {
  readonly entry: bigint;
  readonly exit: bigint;
  readonly quantity: bigint;
  readonly costs: CostRates | undefined;
};

function netAt({ entry, exit, quantity, costs }: NetAtInput): NetText | undefined {
  if (costs === undefined) return undefined;
  const outcome = projectNet({ entry, exit, quantity, costs });
  return outcome === undefined ? undefined : describeNet(outcome);
}

// A proteção contra queda e o alvo da operação aberta, líquidos de custo, com a distância até a proteção quando há preço de agora.
export function buildProtection(input: ProtectionInput): ProtectionView | undefined {
  const { symbol, position, costs, currentPrice } = input;
  const entry = parseScaled(position.entryPrice);
  const stop = parseScaled(position.stopPrice);
  const target = parseScaled(position.targetPrice);
  const quantity = parseScaled(position.quantity);
  if (entry === undefined || stop === undefined || target === undefined) return undefined;
  if (quantity === undefined) return undefined;
  const price = currentPrice === undefined ? undefined : parseScaled(currentPrice);
  const fall = divideFloor(stop - entry, entry);
  return {
    entryPrice: formatPriceAtTick(symbol, position.entryPrice),
    stopPrice: formatPriceAtTick(symbol, position.stopPrice),
    targetPrice: formatPriceAtTick(symbol, position.targetPrice),
    stopNet: netAt({ entry, exit: stop, quantity, costs }),
    targetNet: netAt({ entry, exit: target, quantity, costs }),
    fallFromEntry: fall === undefined ? undefined : minusSign(formatSignedPercentDown(fall)),
    distance: price === undefined ? undefined : measureProtection(entry, stop, price),
  };
}
