// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { DatabaseUnavailableError } from '../packages/database/src/connection/connection-error.js';

import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  foreignKeyViolation,
  LEAD_IN_CANDLES,
  postgresCrash,
  runReference,
  tickUntilIdle,
  withoutCandles,
} from './fixtures/live/live-scenarios.fixture.js';
import { combineLives } from './fixtures/live/in-memory-live-database.fixture.js';
import {
  REAL_DATASETS,
  type RealDataset,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';

function requireDataset(index: number): RealDataset {
  const dataset = REAL_DATASETS[index];
  if (dataset === undefined) throw new Error('conjunto real ausente');
  return dataset;
}

const BTC_HOURLY = requireDataset(0);
const TOTAL_CANDLES = BTC_HOURLY.candles.length;
const CANCEL_AFTER = 10;
const FK_AT = 40;
const PASS_STEPS = 15;

function messages(entries: readonly { readonly message: string }[]): string[] {
  return entries.map((entry) => entry.message);
}

describe('avaliador ao vivo: execução que termina', () => {
  test('cancelada no meio: para no passo seguinte, sem erro, e a execução fica cancelada', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: { afterCommit: (commit, controls) => commit === CANCEL_AFTER && controls.cancel() },
      },
    });
    const { evaluator, logger } = await createTestEvaluator(live);
    const totals = await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(CANCEL_AFTER);
    expect(live.state.status).toBe('cancelled');
    expect(totals.ended).toBe(1);
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(0);
    expect((await evaluator.tick()).steps).toBe(0);
    expect(live.state.commits).toBe(CANCEL_AFTER);
  });

  test('conta apagada ou bloqueada no meio: não avalia mais e a ronda a cancela', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: {
          afterCommit: (commit, controls) => commit === CANCEL_AFTER && controls.deactivateOwner(),
        },
      },
    });
    const { evaluator, logger } = await createTestEvaluator(live, { maxStepsPerPass: PASS_STEPS });
    await tickUntilIdle(evaluator);
    await evaluator.tick();
    expect(live.state.commits).toBe(PASS_STEPS);
    expect(live.state.status).toBe('cancelled');
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(0);
  });

  test('dono que ficou inativo entre o cancelamento e a ronda: a execução acaba sem erro e sem passo', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { hooks: {} } });
    const racing = {
      database: live.database,
      claims: {
        ...live.claims,
        cancelLiveRunsOfInactiveOwners: (): Promise<number> => Promise.resolve(0),
      },
    };
    const { evaluator, logger } = await createTestEvaluator(racing, {
      maxStepsPerPass: PASS_STEPS,
    });
    await evaluator.tick();
    live.controls.deactivateOwner();
    const summary = await evaluator.tick();
    expect(summary.ended).toBe(1);
    expect(summary.steps).toBe(0);
    expect(live.state.commits).toBe(PASS_STEPS);
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(0);
    expect(messages(logger.entries)).toContain('live run ended');
  });

  test('FK violada na exclusão da conta no meio do passo: execução encerrada, sem erro e sem falha gravada', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: {
          afterAppend: (commit) => {
            if (commit === FK_AT) throw foreignKeyViolation();
          },
        },
      },
    });
    const { evaluator, logger } = await createTestEvaluator(live);
    const totals = await tickUntilIdle(evaluator);
    expect(totals.ended).toBe(1);
    expect(totals.failed).toBe(0);
    expect(live.state.errorCode).toBeUndefined();
    expect(live.state.status).not.toBe('failed');
    expect(live.state.commits).toBe(FK_AT - 1);
    expect(logger.entries.filter((entry) => entry.level === 'error')).toHaveLength(0);
    expect(messages(logger.entries)).toContain('live run ended');
  });

  test('uma execução que falha não impede as outras de avançar na mesma ronda', async () => {
    const broken = buildLive({ dataset: BTC_HOURLY, overrides: { tamper: 'run_hash' } });
    const healthy = buildLive({ dataset: BTC_HOURLY });
    const { evaluator } = await createTestEvaluator(combineLives([broken, healthy]));
    const totals = await tickUntilIdle(evaluator);
    expect(totals.failed).toBe(1);
    expect(broken.state.status).toBe('failed');
    expect(healthy.state.commits).toBe(TOTAL_CANDLES);
    expect(healthy.state.status).toBe('running');
  });
});

describe('avaliador ao vivo: falhas tipadas', () => {
  test.each([
    ['run_hash', 'HASH_MISMATCH'],
    ['config_hash', 'HASH_MISMATCH'],
  ] as const)('hash adulterado (%s) falha com %s antes de qualquer passo', async (tamper, code) => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { tamper } });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.status).toBe('failed');
    expect(live.state.errorCode).toBe(code);
    expect(live.state.commits).toBe(0);
  });

  test('histórico menor que o aquecimento falha com INSUFFICIENT_HISTORY e a contagem não vaza o texto do erro', async () => {
    const short = BTC_HOURLY.candles.slice(LEAD_IN_CANDLES - 40);
    const live = buildLive({ dataset: BTC_HOURLY, candles: short });
    const { evaluator, logger } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.status).toBe('failed');
    expect(live.state.errorCode).toBe('INSUFFICIENT_HISTORY');
    expect(live.state.commits).toBe(0);
    expect(messages(logger.entries)).toContain('live run failed');
  });

  test('tipo de execução que não é ao vivo falha com RUN_KIND_UNSUPPORTED', async () => {
    const live = buildLive({ dataset: BTC_HOURLY, overrides: { kind: 'backtest' } });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.errorCode).toBe('RUN_KIND_UNSUPPORTED');
  });

  test('candle que o motor recusa falha com ENGINE_REJECTED_INPUT, sem repetir o valor', async () => {
    const candles = BTC_HOURLY.candles.map((candle, index) =>
      index === 250 ? { ...candle, high: '1', low: '2' } : candle,
    );
    const live = buildLive({ dataset: BTC_HOURLY, candles });
    const { evaluator, logger } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.status).toBe('failed');
    expect(live.state.errorCode).toBe('ENGINE_REJECTED_INPUT');
    expect(live.state.commits).toBe(250);
    expect(JSON.stringify(logger.entries)).not.toContain('"2"');
  });

  test('checkpoint de outra versão do motor falha com ENGINE_STATE_UNUSABLE', async () => {
    const live = buildLive({ dataset: BTC_HOURLY });
    const first = await createTestEvaluator(live, { maxStepsPerPass: 30 });
    await first.evaluator.tick();
    const checkpoint = live.state.checkpoint;
    if (checkpoint === undefined) throw new Error('sem checkpoint');
    live.state.checkpoint = { ...checkpoint, engineState: { version: 99 } };
    live.state.isHeartbeatExpired = true;
    const second = await createTestEvaluator(live, { instanceId: 'worker-b' });
    await tickUntilIdle(second.evaluator);
    expect(live.state.errorCode).toBe('ENGINE_STATE_UNUSABLE');
  });

  test('erro de banco (queda de conexão) não falha a execução: ela segue e é retomada na ronda seguinte', async () => {
    let isDown = true;
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: { hooks: { findCandlesError: () => (isDown ? postgresCrash() : undefined) } },
    });
    const { evaluator, logger } = await createTestEvaluator(live);
    const first = await evaluator.tick();
    expect(first.steps).toBe(0);
    expect(first.failed).toBe(0);
    expect(live.state.status).toBe('running');
    expect(messages(logger.entries)).toContain('live run will be retried');
    isDown = false;
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES);
  });
});

// O Drizzle embrulha o erro do driver (ou o do porteiro) num `DrizzleQueryError` de nome "Error", sem `code`.
function wrappedByDrizzle(cause: Error): Error {
  return Object.assign(new Error('Failed query: select 1'), { cause });
}

function driverError(code: string, field: 'code' | 'errno' = 'errno'): Error {
  return Object.assign(new Error('erro do driver'), { name: 'PostgresError', [field]: code });
}

describe('avaliador ao vivo: falha passageira do banco embrulhada pelo Drizzle', () => {
  test.each([
    ['teto da consulta do porteiro', new DatabaseUnavailableError('DATABASE_QUERY_TIMEOUT')],
    ['porteiro sem banco', new DatabaseUnavailableError('DATABASE_UNAVAILABLE')],
    ['conexão fechada', driverError('ERR_POSTGRES_CONNECTION_CLOSED', 'code')],
    ['rede do driver', driverError('ECONNRESET', 'code')],
    ['tempo ocioso do driver', driverError('ERR_POSTGRES_IDLE_TIMEOUT', 'code')],
    ['statement_timeout 57014', driverError('57014')],
    ['serialização 40001', driverError('40001')],
    ['deadlock 40P01', driverError('40P01')],
    ['lock_timeout 55P03', driverError('55P03')],
    ['parada do operador 57P01', driverError('57P01')],
    ['conexões demais 53300', driverError('53300')],
  ] as const)('%s: a execução segue running e retoma na ronda seguinte', async (_label, cause) => {
    let isDown = true;
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: {
        hooks: { findCandlesError: () => (isDown ? wrappedByDrizzle(cause) : undefined) },
      },
    });
    const { evaluator, logger } = await createTestEvaluator(live);
    const first = await evaluator.tick();
    expect(first.failed).toBe(0);
    expect(live.state.status).toBe('running');
    expect(live.state.errorCode).toBeUndefined();
    expect(messages(logger.entries)).toContain('live run will be retried');
    isDown = false;
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES);
  });

  test('erro de lógica sem código continua falhando a execução com LIVE_UNEXPECTED', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: { hooks: { findCandlesError: () => wrappedByDrizzle(new TypeError('defeito')) } },
    });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.status).toBe('failed');
    expect(live.state.errorCode).toBe('LIVE_UNEXPECTED');
  });

  test('dado inválido embrulhado (22P02) continua falhando, sem repetir para sempre', async () => {
    const live = buildLive({
      dataset: BTC_HOURLY,
      overrides: { hooks: { findCandlesError: () => wrappedByDrizzle(driverError('22P02')) } },
    });
    const { evaluator } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.status).toBe('failed');
  });
});

describe('avaliador ao vivo: lacuna de candles', () => {
  const HOLE_AT = 300;
  const HOLE_SIZE = 3;

  test('buraco que a recuperação ainda pode preencher espera e, preenchido, o resultado é o contínuo', async () => {
    const holey = withoutCandles(BTC_HOURLY.candles, { from: HOLE_AT, count: HOLE_SIZE });
    const live = buildLive({ dataset: BTC_HOURLY, candles: holey });
    const { evaluator, logger } = await createTestEvaluator(live);
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(HOLE_AT);
    expect(messages(logger.entries)).toContain('live run waiting for a candle gap to be recovered');
    live.addCandles(BTC_HOURLY.candles.slice(HOLE_AT, HOLE_AT + HOLE_SIZE));
    await tickUntilIdle(evaluator);
    expect(live.state.commits).toBe(TOTAL_CANDLES);
    expect(live.snapshot()).toStrictEqual(
      runReference({ setup: classicSetup(BTC_HOURLY), candles: BTC_HOURLY.candles }).rows,
    );
  });

  test('lacuna confirmada é declarada ao motor com a contagem exata e o resultado é o do mesmo fluxo com buraco', async () => {
    const holey = withoutCandles(BTC_HOURLY.candles, { from: HOLE_AT, count: HOLE_SIZE });
    const live = buildLive({ dataset: BTC_HOURLY, candles: holey });
    const declared: number[] = [];
    const { evaluator } = await createTestEvaluator(live, {
      isGapConfirmed: (missing) => {
        declared.push(missing.openTimes.length);
        return true;
      },
    });
    await tickUntilIdle(evaluator);
    expect(declared).toStrictEqual([HOLE_SIZE]);
    expect(live.state.commits).toBe(TOTAL_CANDLES - HOLE_SIZE);
    const reference = runReference({ setup: classicSetup(BTC_HOURLY), candles: holey });
    expect(reference.gapCandles).toBe(HOLE_SIZE);
    expect(live.snapshot()).toStrictEqual(reference.rows);
  });
});
