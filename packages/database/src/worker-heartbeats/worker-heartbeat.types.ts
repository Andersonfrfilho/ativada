// Copyright (c) 2026 Ada Technology. All rights reserved.
export type RecordWorkerBeatParams = {
  readonly instanceId: string;
  readonly version: string | undefined;
};

export type LatestWorkerHeartbeat = {
  readonly instanceId: string;
  readonly lastBeatAt: Date;
  // Idade pelo relógio do banco, a mesma régua que gravou a batida.
  readonly ageMilliseconds: number;
};

export type WorkerHeartbeatRepository = {
  // Cria a linha da instância na primeira batida e renova `last_beat_at` nas seguintes; apaga as instâncias mortas.
  readonly recordBeat: (params: RecordWorkerBeatParams) => Promise<void>;
  // A batida mais nova entre todas as instâncias, ou `undefined` sem nenhuma linha.
  readonly findLatest: () => Promise<LatestWorkerHeartbeat | undefined>;
};
