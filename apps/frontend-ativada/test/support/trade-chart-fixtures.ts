// Copyright (c) 2026 Ada Technology. All rights reserved.
export function buildChartResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    symbol: 'BTCUSDT',
    timeframe: '15m',
    from: 1_767_225_600_000,
    to: 1_767_312_000_000,
    lastClosedCandleTime: 1_767_311_100_000,
    columns: [
      {
        startTime: 1_767_225_600_000,
        endTime: 1_767_229_200_000,
        first: '100.5',
        last: '101.25',
        low: '99.9',
        high: '102',
      },
    ],
    markers: [
      {
        positionKey: 'p1',
        side: 'buy',
        candleTime: 1_767_226_500_000,
        price: '100.5',
        quantity: '2',
        fee: '0.201',
        amount: '201.201',
      },
      {
        positionKey: 'p1',
        side: 'sell',
        candleTime: 1_767_228_300_000,
        price: '101.25',
        quantity: '2',
        fee: '0.2025',
        amount: '202.2975',
        netProfit: '0.8955',
        netProfitRate: '0.00445',
      },
    ],
    clusters: null,
    totals: { buys: 1, sells: 1 },
    ...overrides,
  };
}

export function buildSummaryResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    closedTrades: 1,
    totalPaid: '201.201',
    totalReceived: '202.2975',
    totalFees: '0.4035',
    net: '1.0965',
    openTrades: 0,
    openPaid: null,
    message: 'Você pagou 201,20 USDT em 1 compra e recebeu 202,29 USDT nas vendas.',
    ...overrides,
  };
}
