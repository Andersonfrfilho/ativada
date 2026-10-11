// Copyright (c) 2026 Ada Technology. All rights reserved.
// `date` é AAAA-MM-DD (UTC); o índice do dia corrente muda, por isso o upsert atualiza.
export type FearGreedEntry = {
  readonly date: string;
  readonly fearGreed: number;
  readonly classification: string | undefined;
};

// Intervalo semi-aberto: `from` incluído, `to` excluído.
export type FindFearGreedParams = {
  readonly from: string;
  readonly to: string;
};

export type SentimentRepository = {
  readonly upsertFearGreed: (entries: readonly FearGreedEntry[]) => Promise<void>;
  readonly findFearGreed: (params: FindFearGreedParams) => Promise<readonly FearGreedEntry[]>;
  // Data mais recente já gravada; `undefined` quando a tabela está vazia.
  readonly findLatestDate: () => Promise<string | undefined>;
  // O valor do dia mais recente (com a classificação, se a fonte a trouxe); `undefined` quando a tabela está vazia.
  readonly findLatest: () => Promise<FearGreedEntry | undefined>;
};
