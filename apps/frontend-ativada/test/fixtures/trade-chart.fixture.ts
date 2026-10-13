// Copyright (c) 2026 Ada Technology. All rights reserved.
export const FIXTURE_DAY = 86_400_000;
export const FIXTURE_HOUR = 3_600_000;
export const FIXTURE_FROM = Date.parse('2026-04-01T00:00:00.000Z');
export const FIXTURE_COLUMN_COUNT = 40;
export const FIXTURE_TO = FIXTURE_FROM + FIXTURE_COLUMN_COUNT * FIXTURE_DAY;
export const FIXTURE_FILL_HOUR = 14;

type FixtureColumn = {
  readonly startTime: number;
  readonly endTime: number;
  readonly first: string;
  readonly last: string;
  readonly low: string;
  readonly high: string;
};

// 40 colunas de um dia (BNBUSDT, velas de 1 h): sobe devagar com vai-e-volta, de 587,00 a 668,00; abre em 600,00 e fecha em 652,50.
function buildColumns(): FixtureColumn[] {
  let previous = 600;
  return Array.from({ length: FIXTURE_COLUMN_COUNT }, (_, index) => {
    const close = 600 + index * 1.5 + (((index * 37) % 11) - 5) * 2;
    const column = {
      startTime: FIXTURE_FROM + index * FIXTURE_DAY,
      endTime: FIXTURE_FROM + index * FIXTURE_DAY + 23 * FIXTURE_HOUR,
      first: previous.toFixed(2),
      last: close.toFixed(2),
      low: (Math.min(previous, close) - 3).toFixed(2),
      high: (Math.max(previous, close) + 3).toFixed(2),
    };
    previous = close;
    return column;
  });
}

export function fillTime(dayIndex: number): number {
  return FIXTURE_FROM + dayIndex * FIXTURE_DAY + FIXTURE_FILL_HOUR * FIXTURE_HOUR;
}

// Três operações fechadas (duas no lucro e uma no prejuízo), as contas feitas à mão com taxa de 0,1%:
// p1 compra 0,5 a 609,00 (pagou 304,8045) e vende a 612,50 (recebeu 305,94375); p2 0,4 a 625,50 e 638,50; p3 0,3 a 642,00 e 636,00.
const MARKERS = [
  {
    positionKey: 'p1',
    side: 'buy',
    candleTime: fillTime(3),
    price: '609',
    quantity: '0.5',
    fee: '0.3045',
    amount: '304.8045',
  },
  {
    positionKey: 'p1',
    side: 'sell',
    candleTime: fillTime(8),
    price: '612.5',
    quantity: '0.5',
    fee: '0.30625',
    amount: '305.94375',
    netProfit: '1.13925',
    netProfitRate: '0.00373764',
  },
  {
    positionKey: 'p2',
    side: 'buy',
    candleTime: fillTime(14),
    price: '625.5',
    quantity: '0.4',
    fee: '0.2502',
    amount: '250.4502',
  },
  {
    positionKey: 'p2',
    side: 'sell',
    candleTime: fillTime(20),
    price: '638.5',
    quantity: '0.4',
    fee: '0.2554',
    amount: '255.1446',
    netProfit: '4.6944',
    netProfitRate: '0.01874384',
  },
  {
    positionKey: 'p3',
    side: 'buy',
    candleTime: fillTime(25),
    price: '642',
    quantity: '0.3',
    fee: '0.1926',
    amount: '192.7926',
  },
  {
    positionKey: 'p3',
    side: 'sell',
    candleTime: fillTime(29),
    price: '636',
    quantity: '0.3',
    fee: '0.1908',
    amount: '190.6092',
    netProfit: '-2.1834',
    netProfitRate: '-0.01132513',
  },
] as const;

function baseChart(): Record<string, unknown> {
  return {
    symbol: 'BNBUSDT',
    timeframe: '1h',
    from: FIXTURE_FROM,
    to: FIXTURE_TO,
    runRange: { from: FIXTURE_FROM, to: FIXTURE_TO },
    lastClosedCandleTime: FIXTURE_TO - FIXTURE_HOUR,
    columns: buildColumns(),
  };
}

// Um /chart com 40 colunas e 6 marcadores individuais (3 compras, 3 vendas).
export function buildFixtureChart(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...baseChart(),
    markers: MARKERS.map((marker) => ({ ...marker })),
    clusters: null,
    totals: { buys: 3, sells: 3 },
    ...overrides,
  };
}

export const FIXTURE_CLUSTER = {
  startTime: FIXTURE_FROM + 20 * FIXTURE_DAY,
  endTime: FIXTURE_FROM + 21 * FIXTURE_DAY,
  buys: 12,
  sells: 11,
} as const;

// O mesmo período, mas com mais de 500 preenchimentos: a API manda um agrupamento no lugar dos marcadores.
export function buildClusteredFixtureChart(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...baseChart(),
    markers: null,
    clusters: [{ ...FIXTURE_CLUSTER }],
    totals: { buys: FIXTURE_CLUSTER.buys, sells: FIXTURE_CLUSTER.sells },
    ...overrides,
  };
}
