// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createSentimentObservationRepository } from '../src/sentiment/sentiment-observation.repository.js';
import type { SentimentObservationInput } from '../src/sentiment/sentiment-observation.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode } from './persistence-seed.js';

const CHECK_VIOLATION = '23514';
const APPEND_ONLY_MESSAGE = 'append-only';
const SOURCE = 'alternative.me:daily:v1';
const OTHER_SOURCE = 'other:daily:v1';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BASE = Date.UTC(2026, 0, 10);

function row(source: string, day: number, createdAt: Date): SentimentObservationInput {
  return {
    source,
    date: new Date(BASE + day * DAY).toISOString().slice(0, 10),
    fearGreed: 10 + day,
    observedAt: BASE + day * DAY + DAY,
    createdAt,
  };
}

function publishedAt(day: number): Date {
  return new Date(BASE + day * DAY + DAY);
}

export async function checkSentimentObservations(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const repository = createSentimentObservationRepository(handle);
  const rows = [0, 1, 2].map((day) => row(SOURCE, day, publishedAt(day)));
  rows.push(row(OTHER_SOURCE, 1, publishedAt(1)));
  assertCondition((await repository.appendObservations(rows)).inserted === 4, 'primeira carga');
  assertCondition((await repository.appendObservations(rows)).inserted === 0, 'reenvio não grava');
  const stored: unknown =
    await client`SELECT created_at FROM sentiment_observations WHERE source = ${SOURCE} ORDER BY observed_at LIMIT 1`;
  assertCondition(
    (stored as readonly { created_at: Date }[])[0]?.created_at.getTime() ===
      publishedAt(0).getTime(),
    'created_at é o instante estimado de publicação, não o horário da carga',
  );
  reportCheck('sentimento: carga idempotente e created_at histórico preservado');
  await checkImmutability(context);
  await checkSelection(context);
  await checkTieAndPrecision(context);
}

async function checkImmutability(context: LifecycleCheckContext): Promise<void> {
  const { client, assertCondition, reportCheck } = context;
  const update =
    await client`UPDATE sentiment_observations SET fear_greed = 99 WHERE source = ${SOURCE}`.then(
      () => 'atualizado',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
  assertCondition(update.includes(APPEND_ONLY_MESSAGE), `UPDATE deveria ser rejeitado: ${update}`);
  const deletion = await client`DELETE FROM sentiment_observations WHERE source = ${SOURCE}`.then(
    () => 'apagado',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  assertCondition(
    deletion.includes(APPEND_ONLY_MESSAGE),
    `DELETE deveria ser rejeitado: ${deletion}`,
  );
  const range = await captureErrorCode(
    client`INSERT INTO sentiment_observations (id, date, fear_greed, observed_at, source) VALUES (${Bun.randomUUIDv7()}, '2026-02-01', 101, 1, 'x')`,
  );
  assertCondition(range === CHECK_VIOLATION, `fear_greed 101 -> ${String(range)}`);
  reportCheck(
    'sentimento: UPDATE e DELETE rejeitados pelo gatilho; valor fora de 0..100 pelo CHECK',
  );
}

async function checkSelection(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createSentimentObservationRepository(handle);
  const wide = new Date(BASE + 30 * DAY);
  const at = async (
    observedUntil: number,
    insertedUntil: Date,
    source = SOURCE,
  ): Promise<number | undefined> =>
    (await repository.findAvailableAt({ source, observedUntil, insertedUntil }))?.fearGreed;
  assertCondition((await at(BASE + 2 * DAY + 1, wide)) === 10 + 1, 'última com observed_at <= t');
  assertCondition((await at(BASE + 3 * DAY, wide)) === 10 + 2, 'no limite exato vale');
  assertCondition((await at(BASE + DAY - 1, wide)) === undefined, 'antes da primeira: ausente');
  assertCondition((await at(BASE + 3 * DAY, wide, OTHER_SOURCE)) === 11, 'só a fonte pedida');
  assertCondition(
    (await at(BASE + 3 * DAY, publishedAt(0))) === 10,
    'corte de inserção esconde o que entrou depois',
  );
  assertCondition(
    (await at(BASE + 3 * DAY, new Date(publishedAt(1).getTime() - 1))) === 10,
    'corte um milissegundo antes',
  );
  const available = await repository.listAvailable({
    source: SOURCE,
    observedUntil: BASE + 3 * DAY,
    insertedUntil: wide,
  });
  assertCondition(
    available.map((entry) => entry.fearGreed).join() === '10,11,12',
    'série disponível, em ordem',
  );
  reportCheck('sentimento: seleção por fonte, observed_at <= t e created_at <= corte de inserção');
}

async function checkTieAndPrecision(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const repository = createSentimentObservationRepository(handle);
  const tieSource = 'tie:v1';
  const observedAt = BASE + 100 * DAY;
  const wide = new Date(observedAt + DAY);
  await repository.appendObservations([
    {
      source: tieSource,
      date: '2026-05-01',
      fearGreed: 30,
      observedAt,
      createdAt: new Date(observedAt + 2_000),
    },
    {
      source: tieSource,
      date: '2026-05-02',
      fearGreed: 31,
      observedAt,
      createdAt: new Date(observedAt + 1_000),
    },
  ]);
  const byPublication = await repository.findAvailableAt({
    source: tieSource,
    observedUntil: observedAt,
    insertedUntil: wide,
  });
  assertCondition(
    byPublication?.fearGreed === 30,
    'empate em observed_at: vale a de created_at mais recente',
  );
  const sameInstant = new Date(observedAt + 3_000);
  const insertionSource = 'tie-insertion:v1';
  await repository.appendObservations([
    {
      source: insertionSource,
      date: '2026-05-01',
      fearGreed: 40,
      observedAt,
      createdAt: sameInstant,
    },
  ]);
  await repository.appendObservations([
    {
      source: insertionSource,
      date: '2026-05-02',
      fearGreed: 41,
      observedAt,
      createdAt: sameInstant,
    },
  ]);
  const byInsertion = await repository.findAvailableAt({
    source: insertionSource,
    observedUntil: observedAt,
    insertedUntil: wide,
  });
  assertCondition(byInsertion?.fearGreed === 41, 'empate total: vale a inserida por último');
  const cutoff = new Date('2026-06-01T10:00:00.123Z');
  const precisionSource = 'precision:v1';
  await repository.appendObservations([
    {
      source: precisionSource,
      date: '2026-06-01',
      fearGreed: 50,
      observedAt: 1,
      createdAt: new Date('2026-06-01T10:00:00.123Z'),
    },
    {
      source: precisionSource,
      date: '2026-06-02',
      fearGreed: 60,
      observedAt: 2,
      createdAt: new Date('2026-06-01T10:00:00.124Z'),
    },
  ]);
  const found = await repository.findAvailableAt({
    source: precisionSource,
    observedUntil: 10,
    insertedUntil: cutoff,
  });
  assertCondition(found?.fearGreed === 50, 'o corte compara com precisão de milissegundo');
  reportCheck(
    'sentimento: empate decidido pela ordem de inserção; corte de inserção exato ao milissegundo',
  );
}
