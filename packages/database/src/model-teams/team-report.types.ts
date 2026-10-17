// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';
import type { JsonContainer } from '../json-value.types.js';
import type { ModelTeamReportStatus } from './model-team.constant.js';

export type TeamReportSlot = {
  readonly teamKey: string;
  readonly provider: string;
  readonly modelId: string;
};

export type EnqueueTeamReportsParams = {
  readonly teams: readonly TeamReportSlot[];
  readonly symbol: string;
  // Abertura da vela de 15 min decidida.
  readonly candleTime: number;
  readonly cadenceMinutes: number;
};

export type ClaimTeamReportsParams = {
  readonly now: Date;
  readonly limit: number;
  readonly leaseMilliseconds: number;
};

export type ClaimedTeamReport = {
  readonly id: string;
  readonly teamKey: string;
  readonly provider: string;
  readonly modelId: string;
  readonly kind: string;
  readonly symbol: string;
  readonly candleTime: number;
  readonly attempt: number;
  readonly requestedAt: Date;
};

// Leituras públicas do analista naquela vela (iguais entre simulações do par, ADR A3); campos ausentes ficam `null`.
export type PublicReadings = {
  readonly relativeVolume: string | null;
  readonly atrRate: string | null;
  readonly atrPercentile90: string | null;
  readonly atrPercentile95: string | null;
  readonly momentumShort: string | null;
  readonly momentumLong: string | null;
};

export type SpendUsage = { readonly dayUsd: string; readonly monthUsd: string };

export type ReserveBudgetParams = {
  readonly reportId: string;
  readonly reservationUsd: string;
  // Decide sob a trava consultiva, com a soma exata do dia e do mês (gravado + reservado em voo).
  readonly isAllowed: (usage: SpendUsage) => boolean;
};

export type ReserveBudgetResult = { readonly usage: SpendUsage; readonly isReserved: boolean };

export type SaveReportInputParams = {
  readonly reportId: string;
  // O id do modelo que de fato vai ser chamado (do ambiente do worker): grava junto da entrada.
  readonly modelId?: string | undefined;
  readonly input: JsonContainer;
  readonly promptHash: string;
};

export type TeamReportDecision = {
  readonly action: string;
  readonly entryPrice: string | null;
  readonly targetPrice: string | null;
  readonly stopPrice: string | null;
  readonly confidence: number;
  readonly roles: JsonContainer;
  readonly isReasonHidden: boolean;
};

export type TeamReportMeasure = {
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly thinkingTokens?: number | undefined;
  readonly latencyMilliseconds?: number | undefined;
};

export type FinishTeamReportParams = {
  readonly reportId: string;
  readonly status: Exclude<ModelTeamReportStatus, 'pending'>;
  readonly costUsd: string;
  readonly measure: TeamReportMeasure;
  readonly decision?: TeamReportDecision | undefined;
  readonly failureCode?: string | undefined;
  readonly rawOutput?: string | undefined;
};

export type ExpireTeamReportsParams = { readonly olderThanDays: number };

export type EnqueueOnDemandReportParams = {
  readonly teamKey: string;
  readonly provider: string;
  readonly symbol: string;
  // Abertura da última vela de 15 min FECHADA do par.
  readonly candleTime: number;
};

export type TeamReportRepository = {
  // Transação curta própria, `ON CONFLICT DO NOTHING`: devolve quantas linhas `pending` nasceram.
  readonly enqueueTeamReports: (params: EnqueueTeamReportsParams) => Promise<number>;
  // O pedido avulso (RF20): uma linha `pending` do tipo `on_demand`, sem dono (dado público). Devolve o id. O id do modelo é
  // preenchido pelo worker, que é quem o conhece (`saveInput`).
  readonly enqueueOnDemandReport: (params: EnqueueOnDemandReportParams) => Promise<string>;
  readonly claimPending: (params: ClaimTeamReportsParams) => Promise<readonly ClaimedTeamReport[]>;
  readonly readPublicReadings: (params: {
    readonly symbol: string;
    readonly candleTime: number;
  }) => Promise<PublicReadings | undefined>;
  readonly saveInput: (params: SaveReportInputParams) => Promise<void>;
  readonly reserveBudget: (params: ReserveBudgetParams) => Promise<ReserveBudgetResult>;
  // Fecha a linha (decidida, falha ou pulo), zera a reserva e grava o custo real.
  readonly finish: (params: FinishTeamReportParams) => Promise<void>;
  // Apaga relatório antigo e já terminado que nenhuma execução de equipe guardada referencia (DT10).
  readonly expireReports: (params: ExpireTeamReportsParams) => Promise<number>;
};

export type UserModelTeamRecord = { readonly teamKey: string; readonly isEnabled: boolean };

export type ClaimOnDemandParams = {
  readonly teamKey: string;
  // Teto de pedidos avulsos do usuário no dia (UTC), somando as equipes.
  readonly dailyLimit: number;
};

export type UserModelTeamRepository = {
  readonly listTeams: (scope: OwnerScope) => Promise<readonly UserModelTeamRecord[]>;
  // Conta UM pedido avulso do dia, de forma atômica: `false` quando o usuário já usou o teto de hoje.
  readonly claimOnDemand: (scope: OwnerScope, params: ClaimOnDemandParams) => Promise<boolean>;
  readonly setEnabled: (
    scope: OwnerScope,
    params: { readonly teamKey: string; readonly isEnabled: boolean },
  ) => Promise<void>;
};
