// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '../json-value.types.js';

// Uma simulação ao vivo que está rodando, como a varredura a enxerga: só o que a regra de parada precisa.
export type StallCandidate = {
  readonly runId: string;
  readonly symbol: string;
  readonly timeframe: string;
  // Abertura da vela que estava em curso na criação: é a primeira que o worker avalia.
  readonly periodStart: number;
  readonly lastCandleTime: number | undefined;
  readonly isWaitingForData: boolean;
  // Início do episódio já gravado; ausente em dia.
  readonly stalledSince: number | undefined;
};

export type OpenStallEpisodeParams = {
  readonly candidate: StallCandidate;
  readonly stalledSince: number;
  readonly alertPayload: JsonContainer;
};

export type CloseStallEpisodeParams = {
  readonly candidate: StallCandidate;
  readonly alertPayload: JsonContainer;
};

// Tudo o que a varredura faz dentro da UMA transação em que segura a trava: gravar o episódio, enfileirar o alerta e avisar o painel.
export type StallSession = {
  // `false` = outra instância está varrendo: esta não faz mais nada.
  readonly tryAcquireLock: () => Promise<boolean>;
  readonly listCandidates: () => Promise<readonly StallCandidate[]>;
  // Grava `stalled_since` (só se a execução segue rodando, no mesmo passo e sem episódio aberto), enfileira o `STALL` e avisa. `false` = nada mudou.
  readonly openEpisode: (params: OpenStallEpisodeParams) => Promise<boolean>;
  // Apaga o `stalled_since` aberto, enfileira o `RESUME` (só se o `STALL` desse episódio foi enfileirado) e avisa. `false` = nada mudou.
  readonly closeEpisode: (params: CloseStallEpisodeParams) => Promise<boolean>;
  // Episódio que sobrou numa execução que não está mais rodando: só apaga a marca, sem aviso. Devolve quantas.
  readonly clearInactiveEpisodes: () => Promise<number>;
};

export type RunStallRepository = {
  readonly inTransaction: <TResult>(
    work: (session: StallSession) => Promise<TResult>,
  ) => Promise<TResult>;
};
