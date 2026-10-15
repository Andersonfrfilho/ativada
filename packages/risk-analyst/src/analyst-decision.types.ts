// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalSpec } from '@ativada/strategy-engine';

import type {
  AnalystCommandKind,
  AnalystCommandReason,
  AnalystReason,
  CappedDetail,
  EntryGate,
  ForecastSide,
  ForecastStrength,
  LockKey,
  NoDataDetail,
  NoForecastReason,
  Posture,
} from './analyst.constant.js';
import type {
  MarketReadings,
  ReadingCandle,
  RunCost,
  SpecialistView,
  TeamSeries,
  VoteReading,
} from './analyst.types.js';

// Posição da simulação como o analista a vê: aberta (`closedCandleTime: null`) ou fechada com o resultado líquido.
export type AnalystPosition = {
  readonly openedCandleTime: number;
  readonly closedCandleTime: number | null;
  readonly netProfit: string | null;
};

export type AnalystWallet = {
  readonly initialBalance: string;
  readonly equity: string;
  // Patrimônio do ponto de `t − 96·d`; `null` se a simulação começou depois (vale o saldo inicial).
  readonly equityReference: string | null;
  readonly isHalted: boolean;
  readonly lastHaltReason: string | null;
  // As abertas, as fechadas nas últimas 24 h e as 3 últimas fechadas (basta para as travas).
  readonly positions: readonly AnalystPosition[];
};

export type AnalystInput = {
  readonly candleTime: number;
  readonly candles: readonly ReadingCandle[];
  readonly team: TeamSeries;
  readonly strategyVotes: readonly VoteReading[];
  readonly runCost: RunCost;
  readonly riskPerTrade: string;
  readonly wallet: AnalystWallet;
  readonly goal: GoalSpec | null;
  readonly isWaitingForData: boolean;
  // O relógio fica no worker: `true` quando a vela `t` não é a última fechada do par.
  readonly isCatchingUp: boolean;
};

export type RiskLock = {
  readonly key: LockKey;
  readonly current: string | null;
  readonly limit: string;
  readonly isActive: boolean;
  readonly isApplicable: boolean;
};

export type TeamForecast = {
  readonly side: ForecastSide | null;
  readonly strength: ForecastStrength | null;
  readonly noForecastReason: NoForecastReason | null;
  readonly forWeight: string;
  readonly againstWeight: string;
  readonly provenWeight: string;
};

export type CadenceMinutes = 15 | 60 | 240;

// Nunca há comando de entrada: o analista só fecha a porta, abre de volta o que ele mesmo fechou ou manda sair.
export type AnalystCommand = {
  readonly commandId: string;
  readonly kind: AnalystCommandKind;
  readonly reason: AnalystCommandReason;
};

export type AnalystDecision = {
  readonly version: string;
  readonly candleTime: number;
  readonly posture: Posture;
  readonly reason: AnalystReason;
  readonly reasonDetail: NoDataDetail | NoForecastReason | CappedDetail | null;
  readonly cadenceMinutes: CadenceMinutes;
  readonly isOnCadence: boolean;
  readonly entryGate: EntryGate;
  readonly riskScale: string;
  readonly maxTradeMinutes: number;
  readonly timeExitDue: boolean;
  readonly forecast: TeamForecast;
  readonly readings: MarketReadings;
  readonly specialists: readonly SpecialistView[];
  readonly locks: readonly RiskLock[];
  readonly commands: readonly AnalystCommand[];
};

export type PostureChoice = {
  readonly posture: Posture;
  readonly reason: AnalystReason;
  readonly reasonDetail: AnalystDecision['reasonDetail'];
};
