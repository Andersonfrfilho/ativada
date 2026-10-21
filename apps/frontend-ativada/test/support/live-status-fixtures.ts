// Copyright (c) 2026 Ada Technology. All rights reserved.
export const FIXTURE_CANDLE_TIME = 1_767_225_600_000;
const HOUR = 3_600_000;

export function buildDecisionResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    candleTime: FIXTURE_CANDLE_TIME,
    closedAt: FIXTURE_CANDLE_TIME + HOUR,
    close: '100.5',
    action: 'HOLD',
    outcome: 'waited',
    score: '1',
    scoreThreshold: '2',
    regime: 'none',
    message: 'Faltou 1 ponto: o RSI (55) está entre 30 e 70.',
    technicalReason: 'score 1 < buy 2',
    votes: [
      {
        ruleId: 'rsi-14',
        label: 'RSI',
        kind: 'rsi',
        vote: 0,
        weight: '1',
        isMissing: false,
        reading: { value: '55' },
      },
    ],
    ...overrides,
  };
}

export function buildLiveStatusResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    run: {
      id: 'run-1',
      status: 'running',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      periodStart: FIXTURE_CANDLE_TIME - HOUR,
      lastCandleTime: FIXTURE_CANDLE_TIME,
      lastDecisionAt: FIXTURE_CANDLE_TIME + HOUR,
      nextDecisionAt: FIXTURE_CANDLE_TIME + 2 * HOUR,
      waitingForData: null,
    },
    balance: {
      initial: '1000',
      current: '1030.5',
      result: '30.5',
      resultRate: '0.0305',
      observedAt: FIXTURE_CANDLE_TIME + HOUR,
      message: 'Seu saldo agora: 1.030,50 USDT.',
    },
    buyAndHold: {
      value: '1020',
      resultRate: '0.02',
      differencePoints: '1.05',
      comparison: 'above',
      message: 'A estratégia está 1,05 pontos percentuais acima de comprar e segurar.',
    },
    goal: null,
    openPosition: null,
    triggers: {
      status: 'available',
      state: 'awaiting_entry',
      score: '1',
      scoreThreshold: '2',
      scoreGap: '1',
      message: 'Faltam 1 ponto de 2 para comprar.',
      rules: [],
    },
    decisions: { items: [buildDecisionResponse()], nextCursor: null },
    ...overrides,
  };
}
