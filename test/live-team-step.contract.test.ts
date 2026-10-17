// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createTestEvaluator,
  tickUntilIdle,
  type TestEvaluatorOptions,
  type TickTotals,
} from './fixtures/live/live-scenarios.fixture.js';
import type { InMemoryLive } from './fixtures/live/in-memory-live-database.fixture.js';
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
  pendingView,
  TEAM_CANDLE_COUNT,
  TEAM_LEAD_IN,
  TEAM_SETTINGS,
  type TeamScript,
} from './fixtures/model-teams/team-live.fixture.js';

// T3.2 da spec 015 (plan D9, RF14): a execução de equipe lê a decisão GRAVADA da vela, traduz em sinal e entrega à carteira
// existente; a ordem executa em `t + 1`. O passo nunca chama provedor, nunca dorme e nunca aplica decisão tardia.

const BUY_INDEX = cadenceIndex(1);
const SECOND_BUY_INDEX = cadenceIndex(2);
const SELL_INDEX = cadenceIndex(2);
const OPTIONS: TestEvaluatorOptions = { team: TEAM_SETTINGS };

type SignalRow = { readonly action: string; readonly reason: string; readonly score: string };

function signalAt(live: InMemoryLive, index: number): SignalRow | undefined {
  return live.state.results.signals.get(teamCandleOpenTime(index));
}

function fillSides(live: InMemoryLive): readonly { side: string; candleTime: number }[] {
  return [...live.state.results.fills.values()]
    .map((fill) => ({ side: fill.side, candleTime: fill.candleTime }))
    .sort((a, b) => a.candleTime - b.candleTime);
}

async function runToIdle(
  live: InMemoryLive,
  options: TestEvaluatorOptions = OPTIONS,
): Promise<{ readonly totals: TickTotals }> {
  const { evaluator } = await createTestEvaluator(live, options);
  return { totals: await tickUntilIdle(evaluator) };
}

function scriptWithTrades(): TeamScript {
  const script = createTeamScript();
  script.setReport(BUY_INDEX, decidedView({ id: 'report-buy', action: 'buy' }));
  script.setReport(SELL_INDEX, decidedView({ id: 'report-sell', action: 'sell' }));
  return script;
}

describe('compra e venda em t + 1', () => {
  test('compra decidida em t abre na abertura de t + 1 e venda decidida em t fecha em t + 1', async () => {
    const live = buildTeamLive({ script: scriptWithTrades() });
    const { totals } = await runToIdle(live);
    expect(totals.failed).toBe(0);
    expect(signalAt(live, BUY_INDEX)?.action).toBe('BUY');
    expect(signalAt(live, BUY_INDEX)?.score).toBe('100');
    expect(signalAt(live, SELL_INDEX)?.action).toBe('SELL');
    expect(signalAt(live, SELL_INDEX)?.score).toBe('-100');
    expect(fillSides(live)).toEqual([
      { side: 'buy', candleTime: teamCandleOpenTime(BUY_INDEX + 1) },
      { side: 'sell', candleTime: teamCandleOpenTime(SELL_INDEX + 1) },
    ]);
    expect(live.state.status).toBe('running');
  });

  test('nenhuma ordem nasce antes da vela da decisão', async () => {
    const live = buildTeamLive({ script: scriptWithTrades() });
    await runToIdle(live);
    const firstOrder = [...live.state.results.orders.values()][0];
    expect(firstOrder).toBeDefined();
    expect(
      [...live.state.results.fills.values()].every(
        (fill) => fill.candleTime > teamCandleOpenTime(BUY_INDEX),
      ),
    ).toBe(true);
  });

  test('o motivo gravado é o do gestor e os votos ficam vazios', async () => {
    const live = buildTeamLive({ script: scriptWithTrades() });
    await runToIdle(live);
    expect(signalAt(live, BUY_INDEX)?.reason).toBe('Gestor: buy.');
    expect(live.state.results.signals.get(teamCandleOpenTime(BUY_INDEX))?.votes).toEqual([]);
  });

  test('cada vela decidida grava a entrada: relatório, ação aplicada e nenhum código', async () => {
    const live = buildTeamLive({ script: scriptWithTrades() });
    await runToIdle(live);
    const buy = inputsOf(live).find((input) => input.candleTime === teamCandleOpenTime(BUY_INDEX));
    expect(buy).toEqual({
      candleTime: teamCandleOpenTime(BUY_INDEX),
      reportId: 'report-buy',
      failureCode: null,
      appliedAction: 'buy',
    });
  });
});

describe('o que não cabe é ignorado e registra o motivo', () => {
  test('compra com posição aberta vira espera com "ignorada: já comprada"', async () => {
    const script = createTeamScript();
    script.setReport(BUY_INDEX, decidedView({ id: 'a', action: 'buy' }));
    script.setReport(SECOND_BUY_INDEX, decidedView({ id: 'b', action: 'buy' }));
    const live = buildTeamLive({ script });
    await runToIdle(live);
    expect(signalAt(live, SECOND_BUY_INDEX)?.action).toBe('HOLD');
    expect(signalAt(live, SECOND_BUY_INDEX)?.reason).toBe('ignorada: já comprada');
    expect(fillSides(live).filter((fill) => fill.side === 'buy')).toHaveLength(1);
    const input = inputsOf(live).find((item) => item.reportId === 'b');
    expect(input?.appliedAction).toBe('hold');
  });

  test('venda sem posição vira espera com "ignorada: sem posição" e nunca há venda a descoberto', async () => {
    const script = createTeamScript();
    script.setReport(BUY_INDEX, decidedView({ id: 'sell-flat', action: 'sell' }));
    const live = buildTeamLive({ script });
    await runToIdle(live);
    expect(signalAt(live, BUY_INDEX)?.reason).toBe('ignorada: sem posição');
    expect(fillSides(live)).toEqual([]);
  });
});

describe('sem decisão no prazo a equipe espera, com o motivo gravado', () => {
  test('prazo do banco vencido e nenhuma linha: "equipe sem leitura" e código MISSING', async () => {
    const script = createTeamScript();
    script.setPastDeadline(BUY_INDEX);
    const live = buildTeamLive({ script });
    await runToIdle(live);
    expect(signalAt(live, BUY_INDEX)?.action).toBe('HOLD');
    expect(signalAt(live, BUY_INDEX)?.reason).toBe('equipe sem leitura');
    const input = inputsOf(live).find((item) => item.candleTime === teamCandleOpenTime(BUY_INDEX));
    expect(input).toEqual({
      candleTime: teamCandleOpenTime(BUY_INDEX),
      reportId: null,
      failureCode: 'MISSING',
      appliedAction: 'hold',
    });
  });

  test('relatório que falhou grava o código da falha; o que ficou pendente passado o prazo, PENDING', async () => {
    const script = createTeamScript();
    script.setReport(BUY_INDEX, failedView('failed-report', 'UNAVAILABLE'));
    script.setReport(SECOND_BUY_INDEX, pendingView('pending-report'), true);
    const live = buildTeamLive({ script });
    await runToIdle(live);
    const byCandle = new Map(inputsOf(live).map((item) => [item.candleTime, item]));
    expect(byCandle.get(teamCandleOpenTime(BUY_INDEX))?.failureCode).toBe('UNAVAILABLE');
    expect(byCandle.get(teamCandleOpenTime(BUY_INDEX))?.reportId).toBe('failed-report');
    expect(byCandle.get(teamCandleOpenTime(SECOND_BUY_INDEX))?.failureCode).toBe('PENDING');
    expect(signalAt(live, SECOND_BUY_INDEX)?.reason).toBe('equipe sem leitura');
  });

  test('decisão que chegou depois do prazo NUNCA é aplicada àquela vela', async () => {
    const script = createTeamScript();
    script.setReport(BUY_INDEX, decidedView({ id: 'late', action: 'buy', isInTime: false }), true);
    const live = buildTeamLive({ script });
    await runToIdle(live);
    expect(signalAt(live, BUY_INDEX)?.action).toBe('HOLD');
    expect(fillSides(live)).toEqual([]);
    const input = inputsOf(live).find((item) => item.reportId === 'late');
    expect(input?.failureCode).toBe('LATE');
  });

  test('vela fora da grade do ritmo não tem relatório a esperar: segue sem leitura, sem esperar', async () => {
    const live = buildTeamLive({ script: createTeamScript() });
    const { totals } = await runToIdle(live);
    expect(totals.failed).toBe(0);
    const off = inputsOf(live).find((item) => item.failureCode === 'NOT_SCHEDULED');
    expect(off).toBeDefined();
  });
});

describe('saída AWAITING_TEAM: sem commit, sem dormir', () => {
  test('relatório ainda não enfileirado dentro do prazo também espera, e a ronda não conta como encerrada', async () => {
    const script = createTeamScript();
    script.byCandle.set(teamCandleOpenTime(BUY_INDEX), {
      isPastDeadline: false,
      report: undefined,
    });
    const live = buildTeamLive({ script });
    const { totals } = await runToIdle(live);
    expect(totals.ended).toBe(0);
    expect(totals.failed).toBe(0);
    expect(live.state.checkpoint?.lastCandleTime).toBe(teamCandleOpenTime(BUY_INDEX - 1));
  });

  test('relatório pendente dentro do prazo para a ronda na vela e o resto fica como estava', async () => {
    const script = createTeamScript();
    script.setReport(BUY_INDEX, pendingView('slow'));
    const live = buildTeamLive({ script });
    const { evaluator } = await createTestEvaluator(live, OPTIONS);
    const totals = await tickUntilIdle(evaluator);
    expect(totals.failed).toBe(0);
    expect(live.state.checkpoint?.lastCandleTime).toBe(teamCandleOpenTime(BUY_INDEX - 1));
    expect(signalAt(live, BUY_INDEX)).toBeUndefined();
    expect(live.state.teamInputs.has(teamCandleOpenTime(BUY_INDEX))).toBe(false);
    expect(live.state.status).toBe('running');
  });

  test('quando a decisão chega, a ronda seguinte segue do mesmo ponto e compra', async () => {
    const script = createTeamScript();
    script.setReport(BUY_INDEX, pendingView('slow'));
    const live = buildTeamLive({ script });
    const { evaluator } = await createTestEvaluator(live, OPTIONS);
    await tickUntilIdle(evaluator);
    script.setReport(BUY_INDEX, decidedView({ id: 'slow', action: 'buy' }));
    await tickUntilIdle(evaluator);
    expect(signalAt(live, BUY_INDEX)?.action).toBe('BUY');
    expect(fillSides(live)[0]).toEqual({
      side: 'buy',
      candleTime: teamCandleOpenTime(BUY_INDEX + 1),
    });
    expect(live.state.checkpoint?.lastCandleTime).toBe(teamCandleOpenTime(TEAM_CANDLE_COUNT - 1));
  });

  test('uma execução à espera não atrasa as outras do mesmo avaliador', async () => {
    const waiting = createTeamScript();
    waiting.setReport(BUY_INDEX, pendingView('slow'));
    const slow = buildTeamLive({ script: waiting });
    const quick = buildTeamLive({ script: scriptWithTrades() });
    const { combineLives } = await import('./fixtures/live/in-memory-live-database.fixture.js');
    const { evaluator } = await createTestEvaluator(combineLives([slow, quick]), OPTIONS);
    await tickUntilIdle(evaluator);
    expect(slow.state.checkpoint?.lastCandleTime).toBe(teamCandleOpenTime(BUY_INDEX - 1));
    expect(quick.state.checkpoint?.lastCandleTime).toBe(teamCandleOpenTime(TEAM_CANDLE_COUNT - 1));
  });
});

describe('a consulta do relatório', () => {
  test('pede a equipe da execução, o par e o prazo contado do FECHAMENTO da vela', async () => {
    const script = scriptWithTrades();
    const live = buildTeamLive({ script });
    await runToIdle(live);
    expect(script.calls.length).toBeGreaterThan(0);
    for (const call of script.calls) {
      expect(call.teamKey).toBe('lucas');
      expect(call.symbol).toBe('LINKUSDT');
      expect(call.deadlineAt).toBe(call.candleTime + 900_000 + TEAM_SETTINGS.deadlineMilliseconds);
    }
  });
});

describe('lacuna confirmada', () => {
  test('depois do aquecimento a execução de equipe atravessa a lacuna com a contagem exata e segue', async () => {
    const gapIndex = cadenceIndex(1) + 1;
    const candles = buildTeamCandles(TEAM_CANDLE_COUNT).filter(
      (_candle, index) => index !== gapIndex,
    );
    const live = buildTeamLive({ script: scriptWithTrades(), candles });
    const { totals } = await runToIdle(live, { ...OPTIONS, isGapConfirmed: () => true });
    expect(totals.failed).toBe(0);
    expect(live.state.status).toBe('running');
    expect(live.state.checkpoint?.lastCandleTime).toBe(teamCandleOpenTime(TEAM_CANDLE_COUNT - 1));
    expect(live.state.results.signals.get(teamCandleOpenTime(gapIndex + 1))).toBeDefined();
  });
});

describe('aquecimento e candle repetido', () => {
  test('o sinal nulo do aquecimento segue nulo: nenhum relatório é procurado', async () => {
    const script = createTeamScript();
    const live = buildTeamLive({ script });
    await runToIdle(live);
    const warmupLookups = script.lookups.filter(
      (candleTime) => candleTime < teamCandleOpenTime(TEAM_LEAD_IN - 1),
    );
    expect(warmupLookups).toEqual([]);
    expect(signalAt(live, 0)).toBeUndefined();
  });

  test('candle repetido pelo banco é pulado sem tocar a equipe nem duplicar linha', async () => {
    const script = scriptWithTrades();
    const live = buildTeamLive({ script });
    const { evaluator } = await createTestEvaluator(live, OPTIONS);
    await tickUntilIdle(evaluator);
    const lookups = script.lookups.length;
    const rows = live.snapshot();
    await tickUntilIdle(evaluator);
    expect(script.lookups.length).toBe(lookups);
    expect(live.snapshot()).toStrictEqual(rows);
  });
});

describe('recusas', () => {
  test('worker sem o ambiente das equipes recusa a execução de equipe', async () => {
    const live = buildTeamLive({ script: createTeamScript() });
    const { totals } = await runToIdle(live, {});
    expect(totals.failed).toBe(1);
    expect(live.state.status).toBe('failed');
    expect(live.state.errorCode).toBe('INVALID_RUN_DATA');
  });

  test('versão de estratégia diferente da fixa model-team-1 é recusada', async () => {
    const { CLASSIC_STRATEGY } =
      await import('./fixtures/strategy-engine/signal/classic-signals.fixture.js');
    const live = buildTeamLive({
      script: createTeamScript(),
      overrides: { strategy: CLASSIC_STRATEGY },
    });
    const { totals } = await runToIdle(live);
    expect(totals.failed).toBe(1);
    expect(live.state.errorCode).toBe('HASH_MISMATCH');
  });
});
