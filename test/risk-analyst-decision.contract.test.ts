// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { AnalystDecision } from '../packages/risk-analyst/src/index.js';
import { weightOf, wilsonLimitsOf } from './fixtures/risk-analyst/auditor-oracle.fixture.js';
import {
  buildScenarioInput,
  CANDLE,
  closedPosition,
  openPosition,
  SCENARIO_TIME,
  type ScenarioOptions,
} from './fixtures/risk-analyst/decision-scenario.fixture.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const { decideAnalyst } = await loadRiskAnalystApi();

// T1.3 da spec 007 (ADR 0002, A10 a A16): a regra `analyst-1` de ponta a ponta sobre um mercado sintético em que a Reversão
// provou valor (100 acertos em 100; o preço sobe 1 por vela). Volume 10 em toda vela menos a `t`: o volume relativo é
// `volume(t) ÷ 10`.

const REVERSION_WEIGHT = weightOf('above', wilsonLimitsOf({ hits: 100, counted: 100 }).lower);
const T = SCENARIO_TIME;

function decide(options: ScenarioOptions = {}): AnalystDecision {
  return decideAnalyst(buildScenarioInput({ votes: { reversion: 1 }, ...options }));
}

describe('a equipe lê o mercado e a postura segue a A13', () => {
  test('Reversão provou valor e vota a favor, volume 1× e oscilação baixa: LIBERADA (o tamanho da estratégia)', () => {
    const decision = decide();
    expect(decision).toMatchObject({
      version: 'analyst-1',
      candleTime: T,
      posture: 'confident',
      reason: 'firm_forecast',
      reasonDetail: null,
      cadenceMinutes: 60,
      isOnCadence: true,
      entryGate: 'open',
      riskScale: '1',
      maxTradeMinutes: 60,
      timeExitDue: false,
      commands: [],
    });
    expect(decision.forecast).toStrictEqual({
      side: 'up',
      strength: 'firm',
      noForecastReason: null,
      forWeight: REVERSION_WEIGHT,
      againstWeight: '0',
      provenWeight: REVERSION_WEIGHT,
    });
    expect(decision.readings.relativeVolume).toBe('1');
  });

  test('a tabela da equipe: Reversão provou valor (100 de 100); os outros em observação; a estratégia não pesa', () => {
    const { specialists } = decide();
    expect(specialists.map((view) => view.key)).toStrictEqual([
      'trend',
      'reversion',
      'volume',
      'sentiment',
      'strategy',
    ]);
    const reversion = specialists[1];
    expect(reversion).toMatchObject({
      vote: 1,
      isUnread: false,
      predictions: 299,
      counted: 100,
      hits: 100,
      misses: 0,
      verdict: 'above',
      hitRate: '1',
      weight: REVERSION_WEIGHT,
    });
    for (const view of [specialists[0], specialists[2], specialists[3], specialists[4]]) {
      expect(view).toMatchObject({ verdict: 'too_few', weight: '0', counted: 0 });
    }
  });

  test('volume 0,9×: o tamanho cai para MODERADA (metade) porque falta volume para LIBERADA', () => {
    expect(decide({ currentVolume: '9' })).toMatchObject({
      posture: 'normal',
      reason: 'firm_forecast_capped',
      reasonDetail: 'low_volume',
      riskScale: '0.5',
    });
  });

  test('oscilação entre os percentis 90 e 95: MODERADA ("oscilação alta"); acima do 95: sem previsão, CAUTELA', () => {
    const high = decide({ currentAtr: '25.3' });
    expect(high).toMatchObject({
      posture: 'normal',
      reason: 'firm_forecast_capped',
      reasonDetail: 'high_volatility',
    });
    const { atrRate, atrPercentile90, atrPercentile95 } = high.readings;
    expect(Number(atrRate)).toBeGreaterThan(Number(atrPercentile90));
    expect(Number(atrRate)).toBeLessThanOrEqual(Number(atrPercentile95));
    const wild = decide({ currentAtr: '200' });
    expect(wild).toMatchObject({
      posture: 'caution',
      reason: 'no_forecast',
      reasonDetail: 'too_volatile',
      riskScale: '0.25',
    });
  });

  test('ninguém provou valor: CAUTELA (um quarto), sem previsão', () => {
    expect(decide({ winners: [] })).toMatchObject({
      posture: 'caution',
      reason: 'no_forecast',
      reasonDetail: 'no_proven_specialist',
      riskScale: '0.25',
      entryGate: 'open',
    });
  });

  test('os que provaram valor estão neutros nesta vela: CAUTELA', () => {
    expect(decide({ votes: { reversion: 0 } })).toMatchObject({
      posture: 'caution',
      reasonDetail: 'proven_neutral',
    });
  });

  test('equipe contra: PAUSA, tamanho zero e a porta é fechada com um halt', () => {
    const decision = decide({ votes: { reversion: -1 } });
    expect(decision).toMatchObject({
      posture: 'pause',
      reason: 'team_against',
      entryGate: 'closed',
      riskScale: '0',
    });
    expect(decision.commands).toStrictEqual([
      { commandId: `analyst:${T}:halt`, kind: 'halt', reason: 'analyst_pause' },
    ]);
  });

  test('equipe dividida: dois especialistas provaram valor e discordam, sem previsão', () => {
    const decision = decide({
      winners: ['reversion', 'volume'],
      votes: { reversion: 1, volume: -1 },
    });
    expect(decision.forecast).toMatchObject({ side: null, noForecastReason: 'split_team' });
    expect(decision.posture).toBe('caution');
  });

  test('a favor fraca: o vencedor tem menos de 2/3 do peso aprovado (um neutro que provou valor dilui)', () => {
    const decision = decide({
      winners: ['reversion', 'volume'],
      votes: { reversion: 1, volume: 0 },
    });
    expect(decision).toMatchObject({
      posture: 'normal',
      reason: 'weak_forecast',
      riskScale: '0.5',
    });
    expect(decision.forecast.strength).toBe('weak');
  });
});

describe('ritmo e janela de entrada (A11)', () => {
  test('volume 1,5×: olha a cada 15 min e a porta abre em qualquer vela', () => {
    expect(decide({ currentVolume: '15' })).toMatchObject({
      cadenceMinutes: 15,
      entryGate: 'open',
    });
  });

  test('volume 0,7×: 1 hora; esta vela fecha na hora cheia e a porta abre', () => {
    expect(decide({ currentVolume: '7' })).toMatchObject({
      cadenceMinutes: 60,
      isOnCadence: true,
      entryGate: 'open',
    });
  });

  test('volume 0,5×: 4 horas; esta vela não fecha num múltiplo de 4 h, então a porta fecha (halt) sem pausar a postura', () => {
    const decision = decide({ currentVolume: '5' });
    expect(decision).toMatchObject({
      cadenceMinutes: 240,
      isOnCadence: false,
      entryGate: 'closed',
      posture: 'normal',
    });
    expect(decision.commands.map((command) => command.kind)).toStrictEqual(['halt']);
  });

  test('uma vela adiante (fecha às 16 h UTC) a mesma leitura abre a porta de 4 h', () => {
    const decision = decideAnalyst(
      buildScenarioInput({ votes: { reversion: 1 }, currentVolume: '5', start: 10_004 * CANDLE }),
    );
    // (10.004 + 299 + 1) velas = 10.304 × 900.000 ms, múltiplo de 14.400.000 (16 velas).
    expect(decision).toMatchObject({ cadenceMinutes: 240, isOnCadence: true, entryGate: 'open' });
  });

  test('mercado parado (0,39×): PAUSA; 0,4× não é mercado parado', () => {
    expect(decide({ currentVolume: '3.9' })).toMatchObject({
      posture: 'pause',
      reason: 'quiet_market',
    });
    expect(decide({ currentVolume: '4' }).posture).not.toBe('pause');
  });
});

describe('etapa 1 — dado', () => {
  test('espera por dado, vela atrasada, vela faltando e aquecendo: PAUSA com o detalhe e sem previsão', () => {
    const cases: readonly (readonly [ScenarioOptions, string])[] = [
      [{ isWaitingForData: true, isCatchingUp: true }, 'waiting_for_data'],
      [{ isCatchingUp: true }, 'late_candle'],
      [{ missingCandleIndexes: [250] }, 'missing_candles'],
      [{ length: 90 }, 'missing_candles'],
      [{ warmUpCandles: 250 }, 'warming_up'],
    ];
    for (const [options, detail] of cases) {
      const decision = decide(options);
      expect(decision).toMatchObject({
        posture: 'pause',
        reason: 'no_data',
        reasonDetail: detail,
        entryGate: 'closed',
        riskScale: '0',
      });
      expect(decision.forecast).toMatchObject({ side: null, noForecastReason: 'no_data' });
    }
  });

  test('dado faltando vence qualquer trava', () => {
    const decision = decide({ isCatchingUp: true, wallet: { equity: '900' } });
    expect(decision.reason).toBe('no_data');
    expect(decision.locks.find((lock) => lock.key === 'daily_loss')?.isActive).toBe(true);
  });
});

describe('etapa 2 — travas', () => {
  test('perda de 1% em 24 h: PAUSA pelo motivo da trava, mesmo com equipe a favor', () => {
    expect(decide({ wallet: { equity: '990' } })).toMatchObject({
      posture: 'pause',
      reason: 'daily_loss',
      entryGate: 'closed',
    });
    expect(decide({ wallet: { equity: '990.01' } }).posture).toBe('confident');
  });

  test('duas travas ativas: o motivo é o da primeira, na ordem da A10', () => {
    const positions = Array.from({ length: 8 }, (_unused, index) =>
      openPosition(T - (index + 4) * CANDLE),
    );
    const decision = decide({ wallet: { equity: '980', positions } });
    expect(decision.locks.filter((lock) => lock.isActive).map((lock) => lock.key)).toStrictEqual([
      'daily_loss',
      'trade_count',
    ]);
    expect(decision.reason).toBe('daily_loss');
  });

  test('as cinco travas vêm sempre na decisão, mesmo desligadas', () => {
    expect(decide().locks.map((lock) => lock.key)).toStrictEqual([
      'daily_loss',
      'loss_streak',
      'trade_count',
      'goal_room',
      'move_cost',
    ]);
  });

  test('três perdas seguidas: PAUSA; folga curta até a perda máxima da meta: PAUSA', () => {
    const loss = (closedAt: number): ReturnType<typeof closedPosition> =>
      closedPosition({
        openedCandleTime: closedAt - 2 * CANDLE,
        closedCandleTime: closedAt,
        netProfit: '-1',
      });
    const streak = decide({
      wallet: { positions: [loss(T - CANDLE), loss(T - 6 * CANDLE), loss(T - 10 * CANDLE)] },
    });
    expect(streak).toMatchObject({ posture: 'pause', reason: 'loss_streak' });
    const goal = { targetRate: '0.03', maxLossRate: '0.1', horizonDays: 7 };
    const room = decide({ goal, riskPerTrade: '0.05', wallet: { equity: '999.99' } });
    expect(room).toMatchObject({ posture: 'pause', reason: 'goal_room' });
  });

  test('oscilação que não paga o dobro do custo: PAUSA ("movimento ÷ custo")', () => {
    // ATR% de t = 5 ÷ 1.299 = 0,3849%, abaixo de 2 × 0,3% = 0,6%.
    expect(decide({ currentAtr: '5' })).toMatchObject({ posture: 'pause', reason: 'move_cost' });
  });
});

describe('etapa 6 — saída por tempo e etapa 7 — comandos (A14, A15)', () => {
  test('posição aberta há 4 velas (em t − 3·d) manda sair na abertura seguinte; em t − 2·d ainda não', () => {
    const due = decide({ wallet: { positions: [openPosition(T - 3 * CANDLE)] } });
    expect(due.timeExitDue).toBe(true);
    expect(due.commands).toStrictEqual([
      { commandId: `analyst:${T}:exit_position`, kind: 'exit_position', reason: 'analyst_timeout' },
    ]);
    expect(decide({ wallet: { positions: [openPosition(T - 2 * CANDLE)] } }).timeExitDue).toBe(
      false,
    );
  });

  test('a saída por tempo vale em pausa: halt e exit_position juntos, nesta ordem', () => {
    const decision = decide({
      votes: { reversion: -1 },
      wallet: { positions: [openPosition(T - 8 * CANDLE)] },
    });
    expect(decision.posture).toBe('pause');
    expect(decision.commands.map((command) => command.kind)).toStrictEqual([
      'halt',
      'exit_position',
    ]);
  });

  test('sem posição aberta não há saída por tempo a mandar; a fechada não conta', () => {
    const closed = closedPosition({
      openedCandleTime: T - 20 * CANDLE,
      closedCandleTime: T - 10 * CANDLE,
      netProfit: '1',
    });
    const decision = decide({ wallet: { positions: [closed] } });
    expect(decision.timeExitDue).toBe(false);
    expect(decision.commands).toStrictEqual([]);
  });

  test('reabre (resume) só o halt que ele mesmo deu; halt de meta ou do usuário nunca é desfeito', () => {
    const own = decide({ wallet: { isHalted: true, lastHaltReason: 'analyst_pause' } });
    expect(own.commands).toStrictEqual([
      { commandId: `analyst:${T}:resume`, kind: 'resume', reason: 'analyst_resume' },
    ]);
    expect(
      decide({ wallet: { isHalted: true, lastHaltReason: 'goal_reached' } }).commands,
    ).toStrictEqual([]);
    expect(decide({ wallet: { isHalted: true, lastHaltReason: null } }).commands).toStrictEqual([]);
  });

  test('porta fechada com a carteira já parada não repete o halt', () => {
    const decision = decide({
      votes: { reversion: -1 },
      wallet: { isHalted: true, lastHaltReason: 'analyst_pause' },
    });
    expect(decision.commands).toStrictEqual([]);
  });

  test('nenhum comando de entrada existe: só halt, resume e exit_position', () => {
    const decisions = [
      decide(),
      decide({ votes: { reversion: -1 } }),
      decide({ currentVolume: '5' }),
    ];
    for (const decision of decisions) {
      for (const command of decision.commands) {
        expect(['halt', 'resume', 'exit_position']).toContain(command.kind);
      }
    }
  });
});

describe('determinismo e corte da série', () => {
  test('mesma entrada, mesma decisão, byte a byte', () => {
    const input = buildScenarioInput({ votes: { reversion: 1 } });
    expect(JSON.stringify(decideAnalyst(input))).toBe(JSON.stringify(decideAnalyst(input)));
  });

  test('velas e votos depois de t não mudam a decisão (decisão de t com a série cortada em t)', () => {
    const base = buildScenarioInput({ votes: { reversion: 1 } });
    const lastTime = base.candleTime;
    const future = (index: number): { openTime: number; close: string; volume: string } => ({
      openTime: lastTime + index * CANDLE,
      close: '1',
      volume: '99999',
    });
    const extended = {
      ...base,
      candles: [...base.candles, future(1), future(2)],
      team: {
        ...base.team,
        reversion: [
          ...base.team.reversion,
          {
            openTime: lastTime + CANDLE,
            close: '1',
            vote: -1 as const,
            isMissing: false,
            atr: '9999',
          },
        ],
      },
    };
    expect(decideAnalyst(extended)).toStrictEqual(decideAnalyst(base));
  });
});
