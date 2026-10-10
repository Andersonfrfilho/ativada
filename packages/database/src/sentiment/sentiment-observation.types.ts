// Copyright (c) 2026 Ada Technology. All rights reserved.
// `date` é AAAA-MM-DD (UTC); `observedAt` (ms) é o instante em que o valor ficou DISPONÍVEL.
// `createdAt` é o instante da inserção: na carga histórica, o instante ESTIMADO de publicação, nunca
// o horário da carga (ADR 0002 §d); ausente, vale o relógio do banco (coleta ao vivo).
export type SentimentObservationInput = {
  readonly source: string;
  readonly date: string;
  readonly fearGreed: number;
  readonly observedAt: number;
  readonly createdAt: Date | undefined;
};

export type SentimentObservationRecord = {
  readonly source: string;
  readonly date: string;
  readonly fearGreed: number;
  readonly observedAt: number;
  readonly createdAt: Date;
};

// A observação disponível em `t`: da fonte pedida, com `observed_at <= observedUntil` e inserida até `insertedUntil`.
export type FindAvailableObservationParams = {
  readonly source: string;
  readonly observedUntil: number;
  readonly insertedUntil: Date;
};

export type AppendObservationsResult = { readonly inserted: number };

export type SentimentObservationRepository = {
  readonly appendObservations: (
    rows: readonly SentimentObservationInput[],
  ) => Promise<AppendObservationsResult>;
  // Última por `observed_at`; no empate vale a inserida por último.
  readonly findAvailableAt: (
    params: FindAvailableObservationParams,
  ) => Promise<SentimentObservationRecord | undefined>;
  // Toda a série disponível, em ordem crescente, para o backtest escolher a de cada candle em memória.
  readonly listAvailable: (
    params: FindAvailableObservationParams,
  ) => Promise<readonly SentimentObservationRecord[]>;
};
