// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRepository, TeamReportRepository } from '@ativada/database';

import type { TeamRuntime } from './build-team-runtimes.js';
import {
  MODEL_TEAM_CANDLE_MILLISECONDS,
  MODEL_TEAM_STALE_CANDLES,
} from './model-teams.constant.js';

export type ReportEnqueuerDependencies = {
  readonly exchange: string;
  readonly symbols: readonly string[];
  readonly runtimes: readonly TeamRuntime[];
  readonly cadenceMinutes: number;
  readonly candles: Pick<CandleRepository, 'findLatestOpenTime'>;
  readonly reports: Pick<TeamReportRepository, 'enqueueTeamReports'>;
  readonly now: () => number;
};

export type ReportEnqueuer = { readonly enqueueLatest: () => Promise<number> };

// Enfileirar é uma transação curta PRÓPRIA no início da ronda (nunca dentro do passo ao vivo: sem deadlock com ele). A vela
// decidida é a última FECHADA e GRAVADA de cada par; o repositório confere o ritmo, o dono ligado e a simulação rodando.
export function createReportEnqueuer(dependencies: ReportEnqueuerDependencies): ReportEnqueuer {
  const slots = dependencies.runtimes.map((runtime) => ({
    teamKey: runtime.teamKey,
    provider: runtime.provider,
    modelId: runtime.modelId,
  }));
  async function enqueueSymbol(symbol: string): Promise<number> {
    const candleTime = await dependencies.candles.findLatestOpenTime({
      exchange: dependencies.exchange,
      symbol,
      timeframe: '15m',
    });
    if (candleTime === undefined) return 0;
    const age = dependencies.now() - (candleTime + MODEL_TEAM_CANDLE_MILLISECONDS);
    if (age > MODEL_TEAM_STALE_CANDLES * MODEL_TEAM_CANDLE_MILLISECONDS) return 0;
    return dependencies.reports.enqueueTeamReports({
      teams: slots,
      symbol,
      candleTime,
      cadenceMinutes: dependencies.cadenceMinutes,
    });
  }
  return {
    enqueueLatest: async (): Promise<number> => {
      const counts = await Promise.all(dependencies.symbols.map(enqueueSymbol));
      return counts.reduce((total, count) => total + count, 0);
    },
  };
}
