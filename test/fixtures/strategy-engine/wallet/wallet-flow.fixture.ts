// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  COMMAND_KIND,
  COMMAND_REASON,
  createInitialWalletState,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  EngineDecimal,
  RISK_ATR_INDICATOR_ID,
  SIGNAL_ACTION,
  type CommandKind,
  type CommandReason,
  type EngineCandle,
  type EngineCommand,
  type RunSetup,
  type SignalAction,
  type SignalDecision,
  type StrategyVersion,
  type WalletState,
} from '../../../../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from '../engine-scenarios.fixture.js';
import { createRandom } from '../risk/risk-grid.fixture.js';

// Fluxos sintéticos de carteira: o MESMO fluxo alimenta a produção e a referência. Candles com gap, ATR
// zero ou ausente, volume pequeno, limitadas, expirações, stop e alvo no mesmo candle e comandos.
export const WALLET_FLOW_SEED = 20_261_011;
export const WALLET_FLOW_COUNT = 3_000;
export const WALLET_FLOW_MIN_CANDLES = 30;
export const WALLET_FLOW_MAX_CANDLES = 120;

const HOUR = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[ENGINE_TIMEFRAME.ONE_HOUR];
const FIRST_OPEN_TIME = Date.UTC(2026, 0, 1);
const SYMBOL = 'BTCUSDT';
const SEED_STRIDE = 7_919;
const GAP_SHARE_PERCENT = 6;
const COMMAND_SHARE_PERCENT = 7;
const ZERO_ATR_SHARE_PERCENT = 6;
const MISSING_ATR_SHARE_PERCENT = 3;
const ZERO_VOLUME_SHARE_PERCENT = 3;
const MAX_LEAD_IN = 3;
const PERCENT = 100;
const PER_MILLE = 1_000;
const ATR_SIGNIFICANT_DIGITS = 12;
// De cinquenta em cinquenta, um fluxo é uma tempestade de comandos: passa dos 64 identificadores lembrados e
// repete identificadores (alguns já esquecidos), para exercitar a idempotência entre passos e o limite.
const STORM_EVERY_FLOWS = 50;
const STORM_REPEAT_PERCENT = 35;
const STORM_REPEAT_WINDOW = 90;

type Random = (limit: number) => number;

type MarketProfile = {
  readonly tickSize: string;
  readonly quantityStep: string;
  readonly minNotional: string;
  readonly basePrice: string;
};

const PROFILES: readonly MarketProfile[] = [
  { tickSize: '0.01', quantityStep: '0.00001', minNotional: '5', basePrice: '60000' },
  { tickSize: '0.01', quantityStep: '0.0001', minNotional: '5', basePrice: '3000' },
  { tickSize: '0.0001', quantityStep: '1', minNotional: '5', basePrice: '0.5' },
  { tickSize: '1', quantityStep: '0.1', minNotional: '10', basePrice: '100' },
  { tickSize: '0.00000001', quantityStep: '1000', minNotional: '1', basePrice: '0.00002' },
  // Notional de 11 casas: o arredondamento do dinheiro (8 casas) deixa de ser um no-op.
  { tickSize: '0.00000001', quantityStep: '0.001', minNotional: '1', basePrice: '0.00002' },
];
const FEE_RATES = ['0', '0.0005', '0.001', '0.0075', '0.01'] as const;
const SLIPPAGE_RATES = ['0', '0.0005', '0.001', '0.005', '0.02'] as const;
const VOLUME_SHARES = ['0.01', '0.1', '0.5', '1'] as const;
const BALANCES = ['10', '100', '1000', '10000', '1000000'] as const;
const VOLATILITIES_PER_MILLE = [2, 10, 30] as const;
const KEY_PREFIXES = ['', '', '', 'w3:'] as const;
const ENTRY_VARIANTS = [
  { orderType: 'market' },
  { orderType: 'limit', offsetRate: '0.001', expiryCandles: 1 },
  { orderType: 'limit', offsetRate: '0.01', expiryCandles: 3 },
  { orderType: 'limit', offsetRate: '0.05', expiryCandles: 5 },
  { orderType: 'limit', offsetRate: '0.2', expiryCandles: 2 },
] as const;
const STOP_MULTIPLES = ['0.5', '1', '2', '3.5', '20'] as const;
const TARGET_MULTIPLES = ['0.5', '1', '3', '10', '50'] as const;
const RISK_RATES = ['0.001', '0.01', '0.05', '0.1'] as const;
const EXPOSURE_RATES = ['0.25', '0.5', '1'] as const;
const COMMAND_KIND_REASON: Readonly<Record<CommandKind, CommandReason>> = {
  [COMMAND_KIND.HALT]: COMMAND_REASON.USER_STOP,
  [COMMAND_KIND.RESUME]: COMMAND_REASON.USER_RESUME,
  [COMMAND_KIND.EXIT_POSITION]: COMMAND_REASON.GOAL_REACHED,
};
const COMMAND_KINDS = Object.values(COMMAND_KIND);

export type FlowStep = {
  readonly candle: EngineCandle;
  readonly signal: SignalDecision | null;
  readonly commands: readonly EngineCommand[];
};

export type WalletFlow = {
  readonly index: number;
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly keyPrefix: string;
  readonly steps: readonly FlowStep[];
};

function pick<TValue>(random: Random, values: readonly TValue[]): TValue {
  const value = values[random(values.length)];
  if (value === undefined) throw new Error('Lista vazia.');
  return value;
}

function fromTicks(ticks: number, tickSize: string): string {
  return new EngineDecimal(ticks).times(tickSize).toFixed();
}

function volumeText(random: Random): string {
  if (random(PERCENT) < ZERO_VOLUME_SHARE_PERCENT) return '0';
  return new EngineDecimal(`${100 + random(900)}e${random(14) - 4}`).toFixed();
}

function buildStrategy(random: Random): StrategyVersion {
  const config = loadClassicScoreboard();
  return createStrategyVersion({
    ...config,
    entry: { ...pick(random, ENTRY_VARIANTS) },
    risk: {
      ...config.risk,
      stopAtrMultiple: pick(random, STOP_MULTIPLES),
      targetAtrMultiple: pick(random, TARGET_MULTIPLES),
      riskPerTrade: pick(random, RISK_RATES),
      maxExposureRate: pick(random, EXPOSURE_RATES),
    },
  });
}

function buildRun(random: Random, profile: MarketProfile): RunSetup {
  return createRunSetup({
    schemaVersion: 1,
    symbol: SYMBOL,
    timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
    sentimentSource: 'alternative.me',
    initialBalance: pick(random, BALANCES),
    feeRate: pick(random, FEE_RATES),
    slippageRate: pick(random, SLIPPAGE_RATES),
    tickSize: profile.tickSize,
    quantityStep: profile.quantityStep,
    minNotional: profile.minNotional,
    maxVolumeShare: pick(random, VOLUME_SHARES),
  });
}

type CandleDraft = { readonly ticks: number; readonly missing: number };

type CandleParams = {
  readonly random: Random;
  readonly profile: MarketProfile;
  readonly volatility: number;
  readonly previousCloseTicks: number;
  readonly slot: number;
  readonly canGap: boolean;
};

function buildCandle(params: CandleParams): { candle: EngineCandle; ticks: CandleDraft } {
  const { random, profile } = params;
  const hasPriceGap = params.canGap && random(PERCENT) < GAP_SHARE_PERCENT;
  const gapPercent = hasPriceGap ? (random(2) === 0 ? 1 : -1) * (1 + random(8)) : 0;
  const open = Math.max(
    1,
    params.previousCloseTicks + Math.round((params.previousCloseTicks * gapPercent) / PERCENT),
  );
  const spread = Math.max(1, Math.floor((open * params.volatility) / PER_MILLE));
  const close = Math.max(1, open + random(2 * spread + 1) - spread);
  const high = Math.max(open, close) + random(spread + 1);
  const low = Math.max(1, Math.min(open, close) - random(spread + 1));
  const missing = params.canGap && random(PERCENT) < GAP_SHARE_PERCENT ? 1 + random(3) : 0;
  const openTime = FIRST_OPEN_TIME + (params.slot + missing) * HOUR;
  const text = (ticks: number): string => fromTicks(ticks, profile.tickSize);
  return {
    candle: {
      symbol: SYMBOL,
      timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
      openTime,
      closeTime: openTime + HOUR - 1,
      open: text(open),
      high: text(high),
      low: text(low),
      close: text(close),
      volume: volumeText(random),
    },
    ticks: { ticks: close, missing },
  };
}

function pickAtr(random: Random, close: string): number | null {
  const draw = random(PERCENT);
  if (draw < ZERO_ATR_SHARE_PERCENT) return 0;
  if (draw < ZERO_ATR_SHARE_PERCENT + MISSING_ATR_SHARE_PERCENT) return null;
  const share = (1 + random(6_000)) / (PER_MILLE * PERCENT);
  return Number((Number(close) * share).toPrecision(ATR_SIGNIFICANT_DIGITS));
}

function pickAction(random: Random): SignalAction {
  const draw = random(PERCENT);
  if (draw < 38) return SIGNAL_ACTION.BUY;
  return draw < 55 ? SIGNAL_ACTION.SELL : SIGNAL_ACTION.HOLD;
}

type SignalParams = {
  readonly random: Random;
  readonly candle: EngineCandle;
  readonly strategy: StrategyVersion;
  readonly confirmedGapCandles: number;
};

function buildSignal(params: SignalParams): SignalDecision {
  const { random, candle } = params;
  return {
    candleOpenTime: candle.openTime,
    configHash: params.strategy.configHash,
    confirmedGapCandles: params.confirmedGapCandles,
    action: pickAction(random),
    score: '0',
    regime: 'none',
    votes: [],
    indicators: { [RISK_ATR_INDICATOR_ID]: pickAtr(random, candle.close) },
    sentiment: null,
    reason: 'fluxo sintético',
  };
}

function commandOf(params: {
  readonly kind: CommandKind;
  readonly commandId: string;
  readonly candle: EngineCandle;
}): EngineCommand {
  const { kind, commandId, candle } = params;
  return { commandId, issuedAt: candle.openTime, kind, reason: COMMAND_KIND_REASON[kind] };
}

function buildCommands(random: Random, flowIndex: number, candle: EngineCandle): EngineCommand[] {
  if (random(PERCENT) >= COMMAND_SHARE_PERCENT) return [];
  const count = 1 + random(2);
  const kinds = Array.from({ length: count }, () => pick(random, COMMAND_KINDS));
  return kinds.map((kind, order) =>
    commandOf({ kind, commandId: `flow-${flowIndex}-${candle.openTime}-${order}`, candle }),
  );
}

// Comandos em todo candle; parte deles repete um `commandId` recente (nunca duas vezes no mesmo passo).
function buildStormCommands(
  random: Random,
  candle: EngineCandle,
  history: string[],
): EngineCommand[] {
  const used = new Set<string>();
  const commands: EngineCommand[] = [];
  const count = 1 + random(2);
  for (let order = 0; order < count; order += 1) {
    const recent = history.slice(-STORM_REPEAT_WINDOW);
    const repeats = recent.length > 0 && random(PERCENT) < STORM_REPEAT_PERCENT;
    const commandId = repeats ? pick(random, recent) : `storm-${candle.openTime}-${order}`;
    const kind = pick(random, COMMAND_KINDS);
    if (used.has(commandId)) continue;
    used.add(commandId);
    commands.push(commandOf({ kind, commandId, candle }));
  }
  history.push(...commands.map((command) => command.commandId));
  return commands;
}

export function buildWalletFlow(index: number): WalletFlow {
  const random = createRandom(WALLET_FLOW_SEED + index * SEED_STRIDE);
  const profile = pick(random, PROFILES);
  const strategy = buildStrategy(random);
  const run = buildRun(random, profile);
  const volatility = pick(random, VOLATILITIES_PER_MILLE);
  const length =
    WALLET_FLOW_MIN_CANDLES + random(WALLET_FLOW_MAX_CANDLES - WALLET_FLOW_MIN_CANDLES + 1);
  const leadIn = random(MAX_LEAD_IN);
  const basePriceTicks = new EngineDecimal(profile.basePrice)
    .dividedBy(profile.tickSize)
    .toNumber();
  const steps: FlowStep[] = [];
  const isStorm = index % STORM_EVERY_FLOWS === 0;
  const commandHistory: string[] = [];
  let previousCloseTicks = basePriceTicks;
  let slot = 0;
  for (let position = 0; position < length; position += 1) {
    const built = buildCandle({
      random,
      profile,
      volatility,
      previousCloseTicks,
      slot,
      canGap: position > leadIn,
    });
    const { candle } = built;
    const signal =
      position < leadIn
        ? null
        : buildSignal({ random, candle, strategy, confirmedGapCandles: built.ticks.missing });
    const commands = isStorm
      ? buildStormCommands(random, candle, commandHistory)
      : buildCommands(random, index, candle);
    steps.push({ candle, signal, commands });
    previousCloseTicks = built.ticks.ticks;
    slot += built.ticks.missing + 1;
  }
  return { index, strategy, run, keyPrefix: pick(random, KEY_PREFIXES), steps };
}

export function initialWalletOf(flow: WalletFlow): WalletState {
  return createInitialWalletState({
    strategy: flow.strategy,
    run: flow.run,
    keyPrefix: flow.keyPrefix,
  });
}
