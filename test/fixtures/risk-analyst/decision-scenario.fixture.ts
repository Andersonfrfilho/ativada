// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AnalystInput,
  AnalystPosition,
  AnalystWallet,
  SpecialistKey,
  TeamSeries,
  VoteReading,
} from '../../../packages/risk-analyst/src/index.js';
import type { GoalSpec } from '../../../packages/strategy-engine/src/index.js';

// Cenário sintético e determinístico da decisão `analyst-1` (T1.3 da spec 007): o preço sobe 1 por vela (todo voto +1 é
// acerto, todo -1 é erro), o volume é 10 em toda vela menos na `t`, o ATR é 20 e a equipe vota por passo fixo. Quem tem
// histórico "vencedor" vota +1 a cada `stride` velas (todas acertam: `above`); quem não tem não vota (`too_few`).

export const CANDLE = 900_000;
export const SCENARIO_LENGTH = 300;
// (START + 300·d) é múltiplo de 1 h (10.300 é múltiplo de 4) e não de 4 h (10.300 mod 16 = 12).
export const SCENARIO_START = 10_000 * CANDLE;
export const SCENARIO_TIME = SCENARIO_START + (SCENARIO_LENGTH - 1) * CANDLE;

export const WINNING_STRIDE: Readonly<Record<SpecialistKey, number>> = {
  trend: 6,
  reversion: 3,
  volume: 4,
  sentiment: 5,
};

type Vote = -1 | 0 | 1 | null;

export type ScenarioOptions = {
  readonly length?: number;
  readonly start?: number;
  readonly currentVolume?: string;
  readonly currentAtr?: string;
  // Quem tem histórico vencedor (padrão: só a Reversão).
  readonly winners?: readonly SpecialistKey[];
  // O voto de cada especialista na vela `t` (padrão: neutro).
  readonly votes?: Readonly<Partial<Record<SpecialistKey, Vote>>>;
  readonly strategyVote?: Vote;
  readonly wallet?: Partial<AnalystWallet>;
  readonly goal?: GoalSpec | null;
  readonly riskPerTrade?: string;
  readonly isWaitingForData?: boolean;
  readonly isCatchingUp?: boolean;
  // Índices de velas a tirar do mercado (cria lacuna nas leituras).
  readonly missingCandleIndexes?: readonly number[];
  // As primeiras velas ainda aquecendo: sem voto e sem ATR.
  readonly warmUpCandles?: number;
};

function voteAt(params: {
  readonly index: number;
  readonly last: number;
  readonly stride: number;
  readonly isWinner: boolean;
}): Vote {
  const { index, last, stride, isWinner } = params;
  if (index === last) return 0;
  return isWinner && index % stride === 0 ? 1 : 0;
}

function buildSeries(params: {
  readonly key: SpecialistKey;
  readonly options: ScenarioOptions;
  readonly length: number;
  readonly start: number;
}): VoteReading[] {
  const { key, options, length, start } = params;
  const winners = options.winners ?? ['reversion'];
  const last = length - 1;
  return Array.from({ length }, (_unused, index) => {
    const isLast = index === last;
    const isWarmingUp = index < (options.warmUpCandles ?? 0);
    const override = options.votes?.[key];
    const vote =
      isLast && override !== undefined
        ? override
        : voteAt({
            index,
            last,
            stride: WINNING_STRIDE[key],
            isWinner: winners.includes(key),
          });
    return {
      openTime: start + index * CANDLE,
      close: String(1000 + index),
      vote: isWarmingUp ? null : vote,
      isMissing: false,
      atr: isWarmingUp ? null : isLast ? (options.currentAtr ?? '20') : '20',
    };
  });
}

export function defaultWallet(overrides: Partial<AnalystWallet> = {}): AnalystWallet {
  return {
    initialBalance: '1000',
    equity: '1000',
    equityReference: null,
    isHalted: false,
    lastHaltReason: null,
    positions: [],
    ...overrides,
  };
}

export function openPosition(openedCandleTime: number): AnalystPosition {
  return { openedCandleTime, closedCandleTime: null, netProfit: null };
}

export function closedPosition(params: {
  readonly openedCandleTime: number;
  readonly closedCandleTime: number;
  readonly netProfit: string;
}): AnalystPosition {
  return params;
}

export function buildScenarioInput(options: ScenarioOptions = {}): AnalystInput {
  const length = options.length ?? SCENARIO_LENGTH;
  const start = options.start ?? SCENARIO_START;
  const missing = new Set(options.missingCandleIndexes ?? []);
  const keep = <TItem>(items: readonly TItem[]): TItem[] =>
    items.filter((_item, index) => !missing.has(index));
  const seriesOf = (key: SpecialistKey): VoteReading[] =>
    keep(buildSeries({ key, options, length, start }));
  const team: TeamSeries = {
    trend: seriesOf('trend'),
    reversion: seriesOf('reversion'),
    volume: seriesOf('volume'),
    sentiment: seriesOf('sentiment'),
  };
  const candles = keep(
    Array.from({ length }, (_unused, index) => ({
      openTime: start + index * CANDLE,
      close: String(1000 + index),
      volume: index === length - 1 ? (options.currentVolume ?? '10') : '10',
    })),
  );
  const strategyVotes = keep(
    buildSeries({ key: 'trend', options: { winners: [] }, length, start }),
  ).map((reading, index, all) =>
    index === all.length - 1 && options.strategyVote !== undefined
      ? { ...reading, vote: options.strategyVote }
      : reading,
  );
  return {
    candleTime: start + (length - 1) * CANDLE,
    candles,
    team,
    strategyVotes,
    runCost: { feeRate: '0.001', slippageRate: '0.0005' },
    riskPerTrade: options.riskPerTrade ?? '0.01',
    wallet: defaultWallet(options.wallet),
    goal: options.goal ?? null,
    isWaitingForData: options.isWaitingForData ?? false,
    isCatchingUp: options.isCatchingUp ?? false,
  };
}

// Gerador pseudoaleatório determinístico (mulberry32) para os testes de propriedade.
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
