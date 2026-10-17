// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OwnerScope } from '../ownership/owner-scope.js';

// A linha gravada de `team_run_inputs` (plan D9): qual relatório decidiu a vela, ou por que não houve leitura.
export type TeamRunInputWrite = {
  readonly candleTime: number;
  readonly reportId: string | null;
  readonly failureCode: string | null;
  // `buy`, `sell` ou `hold`: a ação que a carteira recebeu depois de a política de sinal ignorar o que não cabia.
  readonly appliedAction: string;
};

export type StoredTeamRunInput = Omit<TeamRunInputWrite, 'candleTime'>;

export type ReadTeamRunInputParams = { readonly runId: string; readonly candleTime: number };

// A decisão do relatório como gravada; `roles` volta como veio do banco e quem lê valida (entrada não confiável).
export type TeamReportDecisionView = {
  readonly action: string;
  readonly entryPrice: string | null;
  readonly targetPrice: string | null;
  readonly stopPrice: string | null;
  readonly confidence: number;
  readonly roles: unknown;
};

export type TeamReportView = {
  readonly id: string;
  readonly status: string;
  readonly failureCode: string | null;
  // Só nos relatórios `decided`.
  readonly decision: TeamReportDecisionView | undefined;
  // O relatório foi decidido até o prazo da vela (`decided_at` ≤ prazo): decisão tardia nunca é aplicada.
  readonly isDecidedInTime: boolean;
};

export type LookupScheduledReportParams = {
  readonly teamKey: string;
  readonly symbol: string;
  readonly candleTime: number;
  // Instante-limite (ms epoch UTC): fechamento da vela mais o prazo da decisão.
  readonly deadlineAt: number;
};

export type ScheduledReportLookup = {
  // Conferido pelo `clock_timestamp()` do BANCO, nunca pelo relógio do processo.
  readonly isPastDeadline: boolean;
  readonly report: TeamReportView | undefined;
};

export type TeamRunInputRepository = {
  readonly readStoredInput: (
    scope: OwnerScope,
    params: ReadTeamRunInputParams,
  ) => Promise<StoredTeamRunInput | undefined>;
  // Relatórios são dado público (como `candles`): o id vem de uma linha de `team_run_inputs` do dono.
  readonly readReportById: (reportId: string) => Promise<TeamReportView | undefined>;
  readonly lookupScheduledReport: (
    params: LookupScheduledReportParams,
  ) => Promise<ScheduledReportLookup>;
};
