// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { canonicalJson } from '../packages/strategy-engine/src/index.js';
import {
  buildLive,
  classicSetup,
  createTestEvaluator,
  postgresCrash,
  runReference,
  tickUntilIdle,
} from './fixtures/live/live-scenarios.fixture.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
import { REAL_DATASETS } from './fixtures/strategy-engine/signal/classic-signals.fixture.js';
import {
  buildTeamCandles,
  teamCandleOpenTime,
} from './fixtures/model-teams/team-candles.fixture.js';
import {
  buildTeamLive,
  cadenceIndex,
  createTeamScript,
  decidedView,
  failedView,
  inputsOf,
  TEAM_SETTINGS,
  type TeamScript,
} from './fixtures/model-teams/team-live.fixture.js';

// T3.3 da spec 015 (plan D9, RF11): a decisão da equipe é ENTRADA GRAVADA. O replay lê `team_run_inputs`, nunca o relógio nem
// o provedor, e dá os mesmos sinais, ordens, preenchimentos e patrimônio; reiniciar não repete nem duplica; a execução de regra
// não muda por existirem equipes.

const OPTIONS = { team: TEAM_SETTINGS };
const BUY_INDEX = cadenceIndex(1);
const SELL_INDEX = cadenceIndex(2);
const REBUY_INDEX = cadenceIndex(3);
const REPORT_BUY_ID = 'report-buy';

function scriptWithTrades(): TeamScript {
  const script = createTeamScript();
  script.setReport(BUY_INDEX, decidedView({ id: REPORT_BUY_ID, action: 'buy' }));
  script.setReport(SELL_INDEX, decidedView({ id: 'report-sell', action: 'sell' }));
  script.setReport(REBUY_INDEX, failedView('report-failed', 'UNAVAILABLE'));
  return script;
}

async function runToIdle(live: InMemoryLive): Promise<void> {
  const { evaluator } = await createTestEvaluator(live, OPTIONS);
  await tickUntilIdle(evaluator);
}

function engineStateOf(live: InMemoryLive): string {
  return canonicalJson(live.state.checkpoint?.engineState ?? null);
}

describe('replay a partir das entradas gravadas', () => {
  test('sem consultar relatório agendado, sinais, ordens, preenchimentos e patrimônio saem iguais', async () => {
    const script = scriptWithTrades();
    const original = buildTeamLive({ script });
    await runToIdle(original);
    expect(original.state.results.fills.size).toBeGreaterThan(0);

    const replayScript = createTeamScript();
    for (const [id, view] of script.byId) replayScript.byId.set(id, view);
    const replay = buildTeamLive({
      script: replayScript,
      overrides: {
        initialTeamInputs: inputsOf(original),
        team: {
          lookupScheduledReport: () => {
            throw new Error('o replay não pode consultar o relatório agendado');
          },
          readReportById: (id) => Promise.resolve(replayScript.byId.get(id)),
        },
      },
    });
    await runToIdle(replay);
    expect(replay.state.status).toBe('running');
    expect(replay.snapshot()).toStrictEqual(original.snapshot());
    expect(engineStateOf(replay)).toBe(engineStateOf(original));
    expect(inputsOf(replay)).toStrictEqual(inputsOf(original));
  });

  test('o relatório gravado manda, não o que o mundo diz agora: o replay ignora um relatório diferente', async () => {
    const script = scriptWithTrades();
    const original = buildTeamLive({ script });
    await runToIdle(original);
    const changed = createTeamScript();
    changed.setReport(BUY_INDEX, decidedView({ id: 'other-report', action: 'sell' }));
    for (const [id, view] of script.byId) changed.byId.set(id, view);
    const replay = buildTeamLive({
      script: changed,
      overrides: { initialTeamInputs: inputsOf(original) },
    });
    await runToIdle(replay);
    expect(replay.snapshot()).toStrictEqual(original.snapshot());
    expect(changed.lookups).not.toContain(teamCandleOpenTime(BUY_INDEX));
  });

  test('uma entrada que aponta para relatório que sumiu vira "sem leitura", sem derrubar a execução', async () => {
    const original = buildTeamLive({ script: scriptWithTrades() });
    await runToIdle(original);
    const replay = buildTeamLive({
      script: createTeamScript(),
      overrides: { initialTeamInputs: inputsOf(original) },
    });
    await runToIdle(replay);
    expect(replay.state.status).toBe('running');
    const buy = replay.state.results.signals.get(teamCandleOpenTime(BUY_INDEX));
    expect(buy?.action).toBe('HOLD');
    expect(buy?.reason).toBe('equipe sem leitura');
  });
});

describe('retomada no meio sem duplicar', () => {
  test.each([1, 30, 100, 130])(
    'queda dentro do passo %i: nada dele fica e a retomada completa igual',
    async (point) => {
      const reference = buildTeamLive({ script: scriptWithTrades() });
      await runToIdle(reference);
      const crashed = { isDone: false };
      const live = buildTeamLive({
        script: scriptWithTrades(),
        overrides: {
          hooks: {
            afterAppend: (commit) => {
              if (commit === point && !crashed.isDone) {
                crashed.isDone = true;
                throw postgresCrash();
              }
            },
          },
        },
      });
      const first = await createTestEvaluator(live, { ...OPTIONS, instanceId: 'worker-doomed' });
      await tickUntilIdle(first.evaluator);
      expect(crashed.isDone).toBe(true);
      live.state.isHeartbeatExpired = true;
      const second = await createTestEvaluator(live, { ...OPTIONS, instanceId: 'worker-rescuer' });
      await tickUntilIdle(second.evaluator);
      expect(live.snapshot()).toStrictEqual(reference.snapshot());
      expect(engineStateOf(live)).toBe(engineStateOf(reference));
      expect(inputsOf(live)).toStrictEqual(inputsOf(reference));
      expect(live.state.commits).toBe(reference.state.commits);
    },
  );

  test('a queda depois da gravação da entrada e antes do commit desfaz a entrada junto com o passo', async () => {
    let seen = 0;
    const live = buildTeamLive({
      script: scriptWithTrades(),
      overrides: {
        hooks: {
          afterAppend: () => {
            seen += 1;
            if (seen === 1) throw postgresCrash();
          },
        },
      },
    });
    const { evaluator } = await createTestEvaluator(live, OPTIONS);
    await evaluator.tick();
    expect(live.state.teamInputs.size).toBe(0);
    expect(live.state.checkpoint).toBeUndefined();
  });
});

describe('a execução de regra não muda por existirem equipes', () => {
  test('com o ambiente das equipes ligado, a execução de regra sai igual ao fluxo contínuo e não toca a equipe', async () => {
    const dataset = REAL_DATASETS[0];
    if (dataset === undefined) throw new Error('conjunto real ausente');
    let touched = 0;
    const live = buildLive({
      dataset,
      overrides: {
        team: {
          lookupScheduledReport: () => {
            touched += 1;
            throw new Error('execução de regra não consulta equipe');
          },
          readReportById: () => {
            touched += 1;
            throw new Error('execução de regra não consulta equipe');
          },
        },
      },
    });
    const { evaluator } = await createTestEvaluator(live, { ...OPTIONS, maxStepsPerPass: 200 });
    await tickUntilIdle(evaluator);
    const reference = runReference({ setup: classicSetup(dataset), candles: dataset.candles });
    expect(live.snapshot()).toStrictEqual(reference.rows);
    expect(engineStateOf(live)).toBe(reference.engineState);
    expect(touched).toBe(0);
    expect(live.state.teamInputs.size).toBe(0);
  });
});

describe('a posição que a tradução vê é a de depois das execuções de t', () => {
  test('a posição que sai pela proteção em t não faz a compra de t virar "já comprada"', async () => {
    const buyScript = createTeamScript();
    buyScript.setReport(BUY_INDEX, decidedView({ id: REPORT_BUY_ID, action: 'buy' }));
    const baseline = buildTeamLive({ script: buyScript });
    await runToIdle(baseline);
    const position = [...baseline.state.results.positions.values()][0];
    const stop = Number(position?.stopPrice);
    expect(Number.isFinite(stop)).toBe(true);
    const candles = buildTeamCandles(baseline.state.candles.length).map((candle, index) =>
      index === SELL_INDEX
        ? { ...candle, low: (stop - 1).toFixed(2), close: (stop + 0.5).toFixed(2) }
        : candle,
    );
    const script = createTeamScript();
    script.setReport(BUY_INDEX, decidedView({ id: REPORT_BUY_ID, action: 'buy' }));
    script.setReport(SELL_INDEX, decidedView({ id: 'rebuy', action: 'buy' }));
    const live = buildTeamLive({ script, candles });
    await runToIdle(live);
    const closed = [...live.state.results.positions.values()].find(
      (row) => row.closedCandleTime !== undefined,
    );
    expect(closed?.exitReason).toBe('stop');
    const signal = live.state.results.signals.get(teamCandleOpenTime(SELL_INDEX));
    expect(signal?.action).toBe('BUY');
    expect(signal?.reason).toBe('Gestor: buy.');
    const buys = [...live.state.results.fills.values()].filter((fill) => fill.side === 'buy');
    expect(buys).toHaveLength(2);
  });
});
