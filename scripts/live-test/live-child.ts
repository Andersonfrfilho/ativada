// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createLiveRunRepository, openDatabase } from '../../packages/database/src/index.js';
import type { LiveCommitOutcome } from '../../apps/worker-ativada/src/live/live-run.types.js';
import {
  CHILD_INSTANCE_VARIABLE,
  CHILD_KILL_VARIABLE,
  EXCHANGE,
  HEARTBEAT_TIMEOUT_SECONDS,
  TICK_PAUSE_MILLISECONDS,
} from './live-test.constant.js';
import { loadLiveSource } from './live-source.js';

const { createLiveEvaluator, createLiveRunDatabase } = await loadLiveSource();

// O worker de produção (avaliador de verdade, banco de verdade) num PROCESSO à parte, que o teste mata com SIGKILL: ou
// depois do N-ésimo passo gravado (determinístico), ou de fora, em qualquer ponto (inclusive no meio de uma transação).
const databaseUrl = Bun.env['DATABASE_URL'] ?? '';
const instanceId = Bun.env[CHILD_INSTANCE_VARIABLE] ?? 'live-child';
const killAfterCommits = Number(Bun.env[CHILD_KILL_VARIABLE] ?? '0');
const handle = openDatabase(databaseUrl);
const database = createLiveRunDatabase({ handle, exchange: EXCHANGE });
let commits = 0;

const evaluator = createLiveEvaluator({
  claims: createLiveRunRepository(handle),
  database: {
    attach: async (runId) => {
      const session = await database.attach(runId);
      if (session === undefined) return undefined;
      return {
        ...session,
        commitStep: async (commit): Promise<LiveCommitOutcome> => {
          const outcome = await session.commitStep(commit);
          commits += 1;
          if (killAfterCommits > 0 && commits >= killAfterCommits)
            process.kill(process.pid, 'SIGKILL');
          return outcome;
        },
      };
    },
  },
  instanceId,
  heartbeatTimeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
  isGapConfirmed: () => false,
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
});

process.stdout.write('ready\n');
for (;;) {
  await evaluator.tick();
  await Bun.sleep(TICK_PAUSE_MILLISECONDS);
}
