// Copyright (c) 2026 Ada Technology. All rights reserved.

// Respostas de `GET /v1/runs/:runId/trade-plan` (trade-plan-1) nas três formas do plano e nas duas de equipe.
function protective(price: string, rate: string, net: string): Record<string, unknown> {
  return {
    price,
    exitPrice: price,
    fromEntryRate: rate,
    distance: { value: '1', rate: '0.01' },
    result: { net, rate },
  };
}

const SIZING = {
  riskAmount: '2.5',
  quantity: '0.001',
  notional: '100',
  entryCost: '100.15',
  constraint: 'none',
};

export function buildAwaitingPlan(): Record<string, unknown> {
  return {
    status: 'awaiting_entry',
    candleTime: 1_767_225_600_000,
    closedAt: 1_767_229_200_000,
    currentPrice: '100000',
    orderType: 'market',
    nextOpenEstimate: '100010',
    entry: { price: '100010', distance: { value: '10', rate: '0.0001' } },
    target: protective('103100', '0.0306123456', '7.65'),
    stop: protective('97000', '-0.0312345678', '-7.8'),
    sizing: SIZING,
    message: 'Compra simulada na abertura da próxima vela.',
  };
}

export function buildHoldingPlan(): Record<string, unknown> {
  return {
    status: 'holding',
    candleTime: 1_767_225_600_000,
    closedAt: 1_767_229_200_000,
    currentPrice: '101000',
    entryPrice: '100000',
    quantity: '0.001',
    entryCost: '100.15',
    openedCandleTime: 1_767_222_000_000,
    exit: {
      price: '101000',
      distance: { value: '0', rate: '0' },
      result: { net: '0.7', rate: '0.007' },
    },
    target: protective('103000', '0.03', '2.8'),
    stop: protective('97000', '-0.03', '-3.2'),
    message: 'Comprado: vende no alvo ou na proteção.',
  };
}

export function buildUnavailablePlan(): Record<string, unknown> {
  return { status: 'unavailable', reason: 'no_candle', message: 'Ainda não há vela fechada.' };
}

export function buildAvailableTeam(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: 'available',
    teamKey: 'olivia',
    displayName: 'Olívia',
    wallet: { current: '1050', result: '50', resultRate: '0.05' },
    reportId: '00000000-0000-4000-8000-000000000001',
    candleTime: 1_767_225_600_000,
    confidence: 72,
    entry: { suggestedPrice: '99900', price: '99900', distance: { value: '-100', rate: '-0.001' } },
    target: protective('104000', '0.04', '10'),
    stop: protective('98000', '-0.019', '-4.9'),
    sizing: SIZING,
    message: 'A Olívia compraria a 99.900,00.',
    ...overrides,
  };
}

export function buildTradePlan(
  plan: Record<string, unknown> = buildAwaitingPlan(),
  teams: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
  return {
    version: 'trade-plan-1',
    runId: 'run-live',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    notice: 'Simulação com dinheiro fictício. Tendência, não promessa.',
    plan,
    teams,
  };
}
