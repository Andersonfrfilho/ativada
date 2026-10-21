// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, JsonValue } from '../json-value.types.js';

export type RecordWorkerBeatParams = {
  readonly instanceId: string;
  readonly version: string | undefined;
  // Resumo das equipes de modelo (só booleanos e códigos); ausente = grava nulo.
  readonly modelTeams?: JsonContainer | undefined;
};

export type LatestWorkerHeartbeat = {
  readonly instanceId: string;
  readonly lastBeatAt: Date;
  // Idade pelo relógio do banco, a mesma régua que gravou a batida.
  readonly ageMilliseconds: number;
  // O resumo das equipes de modelo que a batida levou (só booleanos e códigos); `null` quando o worker não o mandou.
  readonly modelTeams?: JsonValue | undefined;
};

export type WorkerHeartbeatRepository = {
  // Cria a linha da instância na primeira batida e renova `last_beat_at` nas seguintes; apaga as instâncias mortas.
  readonly recordBeat: (params: RecordWorkerBeatParams) => Promise<void>;
  // A batida mais nova entre todas as instâncias, ou `undefined` sem nenhuma linha.
  readonly findLatest: () => Promise<LatestWorkerHeartbeat | undefined>;
};
