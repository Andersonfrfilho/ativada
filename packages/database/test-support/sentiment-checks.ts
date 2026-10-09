// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DatabaseHandle } from '../src/database-handle.js';
import { readPostgresErrorCode } from '../src/postgres-error-code.js';
import { createSentimentRepository } from '../src/sentiment/sentiment.repository.js';

const CHECK_VIOLATION_SQLSTATE = '23514';

export type SentimentCheckContext = {
  readonly handle: DatabaseHandle;
  readonly assertCondition: (condition: boolean, message: string) => void;
  readonly reportCheck: (message: string) => void;
};

export async function checkSentimentRepository(context: SentimentCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createSentimentRepository(handle);
  await repository.upsertFearGreed([
    { date: '2026-01-01', fearGreed: 20, classification: 'Extreme Fear' },
    { date: '2026-01-02', fearGreed: 40, classification: undefined },
    { date: '2026-01-03', fearGreed: 60, classification: 'Greed' },
  ]);
  await repository.upsertFearGreed([
    { date: '2026-01-03', fearGreed: 75, classification: 'Extreme Greed' },
  ]);
  const found = await repository.findFearGreed({ from: '2026-01-02', to: '2026-01-04' });
  assertCondition(found.length === 2, `intervalo devolveu ${found.length}`);
  assertCondition(found[0]?.date === '2026-01-02', 'ordem ou limite inferior errados');
  assertCondition(
    found[0]?.classification === undefined,
    'classification nula deveria ser undefined',
  );
  assertCondition(found[1]?.fearGreed === 75, 'valor do dia não foi atualizado');
  assertCondition(found[1]?.classification === 'Extreme Greed', 'classificação não foi atualizada');
  const excluded = await repository.findFearGreed({ from: '2026-01-01', to: '2026-01-03' });
  assertCondition(excluded.length === 2, 'limite superior deveria ser excluído');
  reportCheck('Fear & Greed: upsert repetido atualiza o dia; leitura semi-aberta e ordenada');

  const rejection = await repository
    .upsertFearGreed([{ date: '2026-01-04', fearGreed: 101, classification: undefined }])
    .catch((error: unknown) => readPostgresErrorCode(error));
  assertCondition(rejection === CHECK_VIOLATION_SQLSTATE, `fear_greed 101 -> ${String(rejection)}`);
  reportCheck('fear_greed fora de 0..100 -> rejeitado pelo CHECK');
}
