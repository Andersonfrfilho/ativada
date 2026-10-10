// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { REAL_DATASETS } from '../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { createApiRunsContext } from '../api-runs-test/api-runs-test-context.js';
import { dataOf, type RunData } from '../api-runs-test/api-runs-helpers.js';
import { HOUR_MILLISECONDS } from './live-test.constant.js';
import {
  assertCondition,
  createProductionEvaluator,
  errorsOf,
  LEAD_IN_CANDLES,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
} from './live-test-context.js';

const SUBJECT = 'subject-live-api';
const OTHER_SUBJECT = 'subject-live-api-other';
const SYMBOL = 'ETHUSDT';
const NEW_CANDLES = 12;
const DEFAULT_LIMIT = 5;

type LiveRunData = RunData & {
  readonly kind: string;
  readonly periodStart: number;
  readonly periodEnd: number | null;
  readonly lastCandleTime: number | null;
};

// A sequência de velas do conjunto real, deslocada para que o candle de índice `LEAD_IN` seja o candle ABERTO agora: é
// onde a API começa uma simulação ao vivo (o candle corrente); as de antes são o aquecimento, já fechado.
function shiftToNow(): {
  warmUp: ReturnType<typeof shift>;
  arriving: ReturnType<typeof shift>;
  startsAt: number;
} {
  const dataset = REAL_DATASETS[0];
  const anchor = dataset?.candles[LEAD_IN_CANDLES];
  if (dataset === undefined || anchor === undefined) throw new Error('sem conjunto real');
  const startsAt = Math.floor(Date.now() / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const offset = startsAt - anchor.openTime;
  const moved = shift(dataset.candles, offset);
  return {
    warmUp: moved.slice(0, LEAD_IN_CANDLES),
    arriving: moved.slice(LEAD_IN_CANDLES, LEAD_IN_CANDLES + NEW_CANDLES),
    startsAt,
  };
}

function shift(candles: readonly EngineCandle[], offset: number): EngineCandle[] {
  return candles.map((candle) => ({
    ...candle,
    openTime: candle.openTime + offset,
    closeTime: candle.closeTime + offset,
  }));
}

// Ponta a ponta pela API REAL: cria a simulação por HTTP, o worker (avaliador de produção) a reivindica no banco e a
// avalia a cada candle que fecha, a rota mostra o andamento e `stop` a encerra.
export async function checkApi(context: LiveTestContext): Promise<void> {
  const api = await createApiRunsContext(context.databaseUrl);
  try {
    const { warmUp, arriving, startsAt } = shiftToNow();
    await seedCandles(context, warmUp, { symbol: SYMBOL });
    const strategy = dataOf<{ version: { id: string } }>(
      await api.call({
        subject: SUBJECT,
        method: 'POST',
        path: '/v1/strategies',
        body: { name: 'Placar ao vivo', config: loadClassicScoreboard() },
      }),
      201,
    );
    const body = {
      strategyVersionId: strategy.version.id,
      kind: 'live_paper',
      symbol: SYMBOL,
      timeframe: '1h',
    };
    const created = dataOf<LiveRunData>(
      await api.call({ subject: SUBJECT, method: 'POST', path: '/v1/runs', body }),
      202,
    );
    assertCondition(
      created.kind === 'live_paper' && created.status === 'queued' && created.periodEnd === null,
      `criação: ${JSON.stringify(created)}`,
    );
    assertCondition(
      created.periodStart === startsAt,
      'a simulação devia começar no candle corrente',
    );
    const worker = createProductionEvaluator(context, { instanceId: 'api-worker' });
    await tickUntilQuiet(worker.evaluator);
    const warmed = dataOf<LiveRunData>(
      await api.call({ subject: SUBJECT, path: `/v1/runs/${created.id}` }),
      200,
    );
    assertCondition(warmed.status === 'running', `depois do aquecimento: ${warmed.status}`);
    assertCondition(
      warmed.lastCandleTime === warmUp.at(-1)?.openTime,
      'último candle do aquecimento',
    );
    await seedCandles(context, arriving, { symbol: SYMBOL, allowFuture: true });
    await tickUntilQuiet(worker.evaluator);
    const running = dataOf<LiveRunData>(
      await api.call({ subject: SUBJECT, path: `/v1/runs/${created.id}` }),
      200,
    );
    assertCondition(
      running.lastCandleTime === arriving.at(-1)?.openTime,
      'a rota não mostra o último candle',
    );
    const signals = dataOf<readonly unknown[]>(
      await api.call({ subject: SUBJECT, path: `/v1/runs/${created.id}/signals?limit=100` }),
      200,
    );
    assertCondition(signals.length > 0, 'nenhum sinal gravado pela simulação ao vivo');
    const foreign = await api.call({
      subject: OTHER_SUBJECT,
      method: 'POST',
      path: `/v1/runs/${created.id}/stop`,
    });
    assertCondition(
      foreign.status === 404,
      `parar a simulação de outro usuário: ${foreign.status}`,
    );
    const stopped = dataOf<{ status: string }>(
      await api.call({ subject: SUBJECT, method: 'POST', path: `/v1/runs/${created.id}/stop` }),
      200,
    );
    assertCondition(stopped.status === 'cancelled', 'stop não cancelou');
    await seedCandles(context, shift(arriving, NEW_CANDLES * HOUR_MILLISECONDS), {
      symbol: SYMBOL,
      allowFuture: true,
    });
    const after = await tickUntilQuiet(worker.evaluator);
    assertCondition(after.steps === 0, `a simulação parada ainda avançou ${after.steps} passos`);
    assertCondition(errorsOf(worker.entries).length === 0, 'erro registrado pelo worker');
    await checkApiLimit(api, strategy.version.id);
    reportLine(
      `API real: POST /v1/runs live_paper -> 202 queued (periodStart = candle corrente, sem fim); o worker a reivindica, aquece e avalia ${NEW_CANDLES} candles novos; GET mostra o andamento e ${signals.length} sinais; stop de outro usuário 404; stop do dono cancela e o worker para; teto de ${DEFAULT_LIMIT} ativas dá 409`,
    );
  } finally {
    await api.stop();
  }
}

async function checkApiLimit(
  api: Awaited<ReturnType<typeof createApiRunsContext>>,
  versionId: string,
): Promise<void> {
  const ids: string[] = [];
  const body = {
    strategyVersionId: versionId,
    kind: 'live_paper',
    symbol: SYMBOL,
    timeframe: '1h',
  };
  for (let count = 0; count < DEFAULT_LIMIT; count += 1) {
    ids.push(
      dataOf<LiveRunData>(
        await api.call({ subject: SUBJECT, method: 'POST', path: '/v1/runs', body }),
        202,
      ).id,
    );
  }
  const over = await api.call({ subject: SUBJECT, method: 'POST', path: '/v1/runs', body });
  assertCondition(over.status === 409, `acima do teto: ${over.status}`);
  for (const id of ids) {
    await api.call({ subject: SUBJECT, method: 'POST', path: `/v1/runs/${id}/stop` });
  }
}
