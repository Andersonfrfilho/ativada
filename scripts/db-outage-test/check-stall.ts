// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cancelRun, createLiveRun, createLiveUser } from '../live-test/live-test-context.js';
import { linkChat } from '../telegram-test/telegram-test-context.js';
import {
  HOUR_MILLISECONDS,
  MARKET_SYMBOL,
  MARKET_TIMEFRAME,
  STALL_CHAT,
  STALL_GRACE_MINUTES,
  STALL_SWEEP_SECONDS,
} from './db-outage-test.constant.js';
import {
  assertCondition,
  reportLine,
  restartWorker,
  waitUntil,
  type OutageSite,
} from './db-outage-context.js';

const MINUTE_MILLISECONDS = 60_000;
const SWEEP_MILLISECONDS = STALL_SWEEP_SECONDS * 1_000;
const DEAD_FOR_HOURS = 3;
const CHANGED_LOG = 'stall sweep changed runs';
const WAIT_MILLISECONDS = SWEEP_MILLISECONDS * 6;

type StalledRun = { readonly stalledSince?: number };
type AlertRow = { readonly side: string; readonly candle_time: string; readonly status: string };

async function readRun(
  site: OutageSite,
  params: { subject: string; runId: string },
): Promise<StalledRun> {
  const response = await site.api.call({
    subject: params.subject,
    path: `/v1/runs/${params.runId}`,
  });
  assertCondition(response.status === 200, `GET /v1/runs/:id: ${response.status}`);
  return (response.json as { readonly data: StalledRun }).data;
}

async function readAlerts(site: OutageSite, runId: string): Promise<AlertRow[]> {
  const rows: unknown = await site.subject
    .client`SELECT side, candle_time::text AS candle_time, status
    FROM alerts WHERE run_id = ${runId} ORDER BY side`;
  return rows as AlertRow[];
}

// O relógio da API é o real, então "worker morto há 20 minutos ou mais, com o relógio adiantado" é montado do outro lado: a
// linha do tempo da simulação recua `DEAD_FOR_HOURS` horas (a regra só olha `agora − vela devida`, o resultado é o mesmo).
export async function checkStall(site: OutageSite): Promise<void> {
  await site.worker.current.kill();
  const logStart = site.api.api.logLines.length;
  const user = await createLiveUser(site.subject, 'stall');
  await linkChat(user, { context: site.subject, chatId: STALL_CHAT, label: 'stall' });
  const currentCandle = Math.floor(Date.now() / HOUR_MILLISECONDS) * HOUR_MILLISECONDS;
  const periodStart = currentCandle - DEAD_FOR_HOURS * HOUR_MILLISECONDS;
  const run = await createLiveRun(site.subject, {
    symbol: MARKET_SYMBOL,
    timeframe: MARKET_TIMEFRAME,
    periodStart,
    user,
  });
  await site.subject.client`UPDATE runs SET status = 'running', started_at = now(),
    claimed_by = 'worker-morto' WHERE id = ${run.id}`;
  const expectedSince = periodStart + HOUR_MILLISECONDS + STALL_GRACE_MINUTES * MINUTE_MILLISECONDS;
  const params = { subject: user.subject, runId: run.id };

  const bannerAfter = await waitUntil(
    'a faixa de parada (stalledSince) aparecer no GET /v1/runs/:id',
    async () => (await readRun(site, params)).stalledSince !== undefined,
    WAIT_MILLISECONDS,
  );
  const stalled = await readRun(site, params);
  assertCondition(stalled.stalledSince === expectedSince, `stalledSince: ${stalled.stalledSince}`);
  const list = await site.api.call({ subject: user.subject, path: '/v1/runs' });
  const listed = (list.json as { readonly data: { id: string; stalledSince?: number }[] }).data;
  assertCondition(
    listed.find((item) => item.id === run.id)?.stalledSince === expectedSince,
    'a lista não traz stalledSince',
  );
  await Bun.sleep(SWEEP_MILLISECONDS * 3);
  const repeated = await readAlerts(site, run.id);
  assertCondition(
    repeated.length === 1 &&
      repeated[0]?.side === 'STALL' &&
      repeated[0].candle_time === String(expectedSince) &&
      repeated[0].status === 'pending',
    `esperado UM STALL pendente depois de várias rondas: ${JSON.stringify(repeated)}`,
  );
  assertCondition(
    (await readRun(site, params)).stalledSince === expectedSince,
    'stalledSince mudou com a ronda repetida',
  );

  // O worker "volta": o checkpoint alcança a última vela fechada e a próxima ronda encerra o episódio.
  await site.subject.client`UPDATE runs SET last_candle_time = ${currentCandle - HOUR_MILLISECONDS}
    WHERE id = ${run.id}`;
  const resumeAfter = await waitUntil(
    'a faixa sumir quando a simulação alcança a vela devida',
    async () => (await readRun(site, params)).stalledSince === undefined,
    WAIT_MILLISECONDS,
  );
  await Bun.sleep(SWEEP_MILLISECONDS * 2);
  const closed = await readAlerts(site, run.id);
  assertCondition(
    closed.map((alert) => alert.side).join(',') === 'RESUME,STALL' &&
      closed.every((alert) => alert.candle_time === String(expectedSince)),
    `esperado UM STALL e UM RESUME no início do episódio: ${JSON.stringify(closed)}`,
  );

  const changedLines = site.api.api.logLines
    .slice(logStart)
    .filter((line) => line.includes(CHANGED_LOG));
  assertCondition(changedLines.length === 2, `linhas de mudança no log: ${changedLines.length}`);
  const logText = changedLines.join('');
  assertCondition(
    ![run.id, user.subject, MARKET_SYMBOL, STALL_CHAT].some((secret) => logText.includes(secret)),
    'o log da varredura vazou id, dono, par ou chat',
  );
  await cancelRun(site.subject, { runId: run.id, user });
  restartWorker(site);
  reportLine(
    `parada: worker morto, simulação ${DEAD_FOR_HOURS} h atrás; faixa (stalledSince = ${expectedSince}) em ${bannerAfter} ms; UM STALL pendente depois de várias rondas; ao alcançar, faixa some em ${resumeAfter} ms e fica UM RESUME; log da varredura só com contagens`,
  );
}
