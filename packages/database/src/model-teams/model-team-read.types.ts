// Copyright (c) 2026 Ada Technology. All rights reserved.

// Uma recomendação como a tabela guarda: as colunas e `roles` como veio do banco (quem lê valida; é saída de modelo).
export type TeamReportRow = {
  readonly id: string;
  readonly teamKey: string;
  readonly kind: string;
  readonly candleTime: number;
  readonly status: string;
  readonly failureCode: string | null;
  readonly action: string | null;
  readonly entryPrice: string | null;
  readonly targetPrice: string | null;
  readonly stopPrice: string | null;
  readonly confidence: number | null;
  readonly roles: unknown;
  readonly isReasonHidden: boolean;
  readonly latencyMilliseconds: number | null;
  readonly costUsd: string;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
};

// Acertos de lado de `buy`/`sell` agendados e decididos nos últimos dias, cuja vela seguinte já fechou; empate à parte.
export type TeamScoreRow = {
  readonly teamKey: string;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
};

// Custo gravado (e o reservado em voo) de hoje e do mês, em UTC, pelo relógio do banco.
export type TeamSpendRow = {
  readonly teamKey: string;
  readonly dayUsd: string;
  readonly monthUsd: string;
};

export type TeamFailureRow = {
  readonly teamKey: string;
  readonly total: number;
  readonly failed: number;
};

export type ReadOverviewParams = {
  readonly exchange: string;
  readonly symbol: string;
  readonly limitPerTeam: number;
  // Os pedidos avulsos que o cliente acompanha (o id vem do `202` e ninguém o adivinha).
  readonly onDemandIds: readonly string[];
  readonly scoreboardDays: number;
  readonly failureHours: number;
};

// Tudo o que o estado das equipes de um par precisa, numa consulta só.
export type ModelTeamOverview = {
  // Recomendações agendadas (qualquer estado, menos pendente), `limitPerTeam` por equipe, da mais nova.
  readonly latest: readonly TeamReportRow[];
  readonly onDemand: readonly TeamReportRow[];
  readonly scores: readonly TeamScoreRow[];
  readonly spend: readonly TeamSpendRow[];
  readonly failures: readonly TeamFailureRow[];
};

export type ModelTeamReadRepository = {
  readonly readOverview: (params: ReadOverviewParams) => Promise<ModelTeamOverview>;
  // Os relatórios agendados daquelas velas (a comparação lado a lado).
  readonly listReportsForCandles: (params: {
    readonly symbol: string;
    readonly candleTimes: readonly number[];
  }) => Promise<readonly TeamReportRow[]>;
};
