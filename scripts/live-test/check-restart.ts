// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import { canonicalJson } from '../../packages/strategy-engine/src/index.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  CHILD_INSTANCE_VARIABLE,
  CHILD_KILL_VARIABLE,
  CHILD_SCRIPT,
  TICK_PAUSE_MILLISECONDS,
} from './live-test.constant.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  LEAD_IN_CANDLES,
  readProgress,
  reportLine,
  waitFor,
  type LiveTestContext,
} from './live-test-context.js';

type Trial = {
  readonly label: string;
  // Mata o processo logo depois do N-ésimo passo gravado (determinístico).
  readonly killAfterCommits?: number;
  // Mata de FORA quando a simulação passa deste candle: o SIGKILL cai onde calhar, inclusive no meio de uma transação.
  readonly killFromOutsideAtCandle?: number;
};

const TRIALS: readonly Trial[] = [
  { label: 'depois do 1º passo', killAfterCommits: 1 },
  { label: `no fim do aquecimento (passo ${LEAD_IN_CANDLES})`, killAfterCommits: LEAD_IN_CANDLES },
  { label: 'com a simulação em curso (passo 250)', killAfterCommits: 250 },
  { label: 'SIGKILL de fora aos 230 candles', killFromOutsideAtCandle: 230 },
  { label: 'SIGKILL de fora aos 60 candles', killFromOutsideAtCandle: 60 },
];

function spawnChild(
  context: LiveTestContext,
  params: Trial & { readonly instanceId: string },
): Bun.Subprocess {
  return Bun.spawn([process.execPath, 'run', CHILD_SCRIPT], {
    cwd: new URL('../../', import.meta.url).pathname,
    env: {
      PATH: Bun.env['PATH'] ?? '',
      HOME: Bun.env['HOME'] ?? '',
      DATABASE_URL: context.databaseUrl,
      [CHILD_INSTANCE_VARIABLE]: params.instanceId,
      [CHILD_KILL_VARIABLE]: String(params.killAfterCommits ?? 0),
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });
}

async function runTrial(context: LiveTestContext, trial: Trial, index: number): Promise<void> {
  const dataset = REAL_DATASETS[0];
  const reference = dataset === undefined ? undefined : context.references.get(dataset.name);
  const first = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || reference === undefined || first === undefined) {
    throw new Error('sem a referência da paridade');
  }
  const { symbol, timeframe } = dataset.market;
  if (timeframe !== '1h') throw new Error('timeframe fora do conjunto');
  const run = await createLiveRun(context, { symbol, timeframe, periodStart: first.openTime });
  const doomed = `doomed-${index}`;
  const child = spawnChild(context, { ...trial, instanceId: doomed });
  if (trial.killFromOutsideAtCandle !== undefined) {
    const target = dataset.candles[trial.killFromOutsideAtCandle]?.openTime ?? 0;
    await waitFor('o processo avançar até o ponto da morte', async () => {
      return ((await readProgress(context, run.id)).lastCandleTime ?? 0) >= target;
    });
    child.kill('SIGKILL');
  }
  await child.exited;
  assertCondition(
    child.signalCode === 'SIGKILL',
    `${trial.label}: o processo não morreu por SIGKILL`,
  );
  const dead = await readProgress(context, run.id);
  assertCondition(
    dead.status === 'running' && dead.claimedBy === doomed,
    `${trial.label}: a execução devia ficar running presa à instância morta (${dead.status})`,
  );
  assertCondition(
    (dead.lastCandleTime ?? 0) < reference.lastCandleTime,
    `${trial.label}: o processo já tinha terminado`,
  );
  const rescuer = createProductionEvaluator(context, { instanceId: `rescuer-${index}` });
  await waitFor('a instância nova retomar e alcançar o último candle', async () => {
    await rescuer.evaluator.tick();
    await Bun.sleep(TICK_PAUSE_MILLISECONDS);
    return (await readProgress(context, run.id)).lastCandleTime === reference.lastCandleTime;
  });
  const persisted = await readPersistedRun(context.backtest, run.id);
  assertCondition(
    digestOf(persisted.rows) === reference.rowsDigest,
    `${trial.label}: o resultado retomado difere do contínuo`,
  );
  assertCondition(
    canonicalJson(JSON.parse(JSON.stringify(persisted.engineState))) === reference.engineStateJson,
    `${trial.label}: o estado do motor retomado difere do contínuo`,
  );
  assertCondition(
    JSON.stringify(persisted.counts) === JSON.stringify(reference.counts),
    `${trial.label}: contagens ${JSON.stringify(persisted.counts)} diferem de ${JSON.stringify(reference.counts)}`,
  );
  assertCondition(errorsOf(rescuer.entries).length === 0, `${trial.label}: erro registrado`);
  await cancelRun(context, { runId: run.id });
  reportLine(
    `(i) morte ${trial.label}: retomada por outra instância do checkpoint (last_candle_time ${dead.lastCandleTime}), digest ${digestOf(persisted.rows).slice(0, 16)} IDÊNTICO ao contínuo, nenhuma operação nem sinal duplicado`,
  );
}

// Reiniciar no meio NÃO duplica operação nem sinal: matar o processo entre passos, ou no meio de um, e retomar dá o
// resultado da execução contínua.
export async function checkRestart(context: LiveTestContext): Promise<void> {
  for (const [index, trial] of TRIALS.entries()) await runTrial(context, trial, index);
}
