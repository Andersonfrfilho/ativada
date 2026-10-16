// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  divideFloor,
  formatSignedPercentDown,
  formatSignedScaled,
  parseScaled,
} from '../../../format/decimal.js';
import { formatTimeInZone } from '../../../format/zoned-time.js';
import type { IconName } from '../../../layout/Icon.component.js';
import { formatPriceAtTick } from '../../../notices/symbol-filters.js';
import type { Trade } from '../../run.validation.js';
import {
  describeNet,
  describeRatio,
  minusSign,
  projectNet,
  toneOf,
  type CostRates,
  type NetText,
  type NetTone,
} from './protection-math.js';

export type PlaqueView = {
  readonly key: string;
  readonly icon: IconName;
  readonly word: string;
  readonly priceText: string;
  readonly percent: string;
  readonly tone: NetTone;
  readonly lines: readonly string[];
};

export type PlaqueInput = {
  readonly symbol: string;
  readonly timeZone: string;
  readonly costs: CostRates | undefined;
  readonly openTrade: Trade | undefined;
  readonly closedTrade: Trade | undefined;
  // O preço de agora (tick vivo ou o do servidor), em texto decimal.
  readonly currentPrice: string | undefined;
};

function iconOf(tone: NetTone): IconName {
  if (tone === 'gain') return 'arrowUp';
  return tone === 'loss' ? 'arrowDown' : 'equal';
}

function netLines(text: NetText, label: string): readonly string[] {
  return [`${label} (bruto ${text.gross})`, text.amount];
}

type OpenLevels = {
  readonly entry: bigint;
  readonly quantity: bigint;
  readonly target: bigint;
  readonly stop: bigint;
};

function readOpenLevels(trade: Trade): OpenLevels | undefined {
  const { targetPrice, stopPrice } = trade;
  const entry = parseScaled(trade.entryPrice);
  const quantity = parseScaled(trade.quantity);
  const target = targetPrice === undefined ? undefined : parseScaled(targetPrice);
  const stop = stopPrice === undefined ? undefined : parseScaled(stopPrice);
  if (entry === undefined || quantity === undefined) return undefined;
  if (target === undefined || stop === undefined) return undefined;
  return { entry, quantity, target, stop };
}

// A compra com a conta do alvo e da proteção, líquidas de custo; sem alvo e proteção ou sem custo declarado, nada é inventado.
function buyPlaque(input: PlaqueInput): PlaqueView | undefined {
  const { openTrade: trade, costs, symbol } = input;
  if (trade === undefined || costs === undefined) return undefined;
  const levels = readOpenLevels(trade);
  if (levels === undefined) return undefined;
  const { entry, quantity } = levels;
  const gain = projectNet({ entry, exit: levels.target, quantity, costs });
  const loss = projectNet({ entry, exit: levels.stop, quantity, costs });
  if (gain === undefined || loss === undefined) return undefined;
  const gainText = describeNet(gain);
  const lossText = describeNet(loss);
  const ratio = describeRatio(gain, loss);
  const target = formatPriceAtTick(symbol, trade.targetPrice ?? '');
  return {
    key: 'buy',
    icon: 'arrowUp',
    word: 'COMPRA',
    priceText: formatPriceAtTick(symbol, trade.entryPrice),
    percent: gainText.percent,
    tone: gainText.tone,
    lines: [
      ...netLines(gainText, `no alvo ${target}`),
      `proteção ${lossText.percent} (${lossText.amount})`,
      ...(ratio === undefined ? [] : [`ganho ÷ risco ${ratio}`]),
    ],
  };
}

function openPlaque(input: PlaqueInput): PlaqueView | undefined {
  const { openTrade: trade, costs, currentPrice, symbol, timeZone } = input;
  if (trade === undefined || costs === undefined || currentPrice === undefined) return undefined;
  const entry = parseScaled(trade.entryPrice);
  const quantity = parseScaled(trade.quantity);
  const price = parseScaled(currentPrice);
  if (entry === undefined || quantity === undefined || price === undefined) return undefined;
  const outcome = projectNet({ entry, exit: price, quantity, costs });
  if (outcome === undefined) return undefined;
  const text = describeNet(outcome);
  return {
    key: 'open',
    icon: iconOf(text.tone),
    word: `COMPRADO desde ${formatTimeInZone(trade.openedCandleTime, timeZone)}`,
    priceText: formatPriceAtTick(symbol, trade.entryPrice),
    percent: text.percent,
    tone: text.tone,
    lines: netLines(text, 'se vender agora'),
  };
}

const EXIT_WORD: Readonly<Record<string, string>> = {
  target: 'VENDA',
  stop: 'SAÍDA PELA PROTEÇÃO',
};

// A saída já fechada: o líquido vem do servidor (taxas e deslizamento reais dos preenchimentos); só o bruto sai dos preços.
function closedPlaque(input: PlaqueInput): PlaqueView | undefined {
  const { closedTrade: trade, symbol } = input;
  if (trade === undefined || trade.exitPrice === undefined) return undefined;
  const rate = trade.netProfitRate === undefined ? undefined : parseScaled(trade.netProfitRate);
  const entry = parseScaled(trade.entryPrice);
  const exit = parseScaled(trade.exitPrice);
  if (rate === undefined || entry === undefined || exit === undefined) return undefined;
  const gross = divideFloor(exit - entry, entry);
  const amount = trade.netProfit === undefined ? undefined : parseScaled(trade.netProfit);
  const tone = toneOf(rate);
  const grossText =
    gross === undefined ? '' : ` (bruto ${minusSign(formatSignedPercentDown(gross))})`;
  return {
    key: 'closed',
    icon: iconOf(tone),
    word: EXIT_WORD[trade.exitReason ?? ''] ?? 'SAÍDA',
    priceText: formatPriceAtTick(symbol, trade.exitPrice),
    percent: minusSign(formatSignedPercentDown(rate)),
    tone,
    lines: [
      `resultado${grossText}`,
      ...(amount === undefined ? [] : [`${minusSign(formatSignedScaled(amount))} USDT`]),
    ],
  };
}

// As plaquinhas da operação: a compra com alvo e proteção, a operação aberta agora e a última saída.
export function buildPlaques(input: PlaqueInput): readonly PlaqueView[] {
  return [buyPlaque(input), openPlaque(input), closedPlaque(input)].filter(
    (plaque) => plaque !== undefined,
  );
}
