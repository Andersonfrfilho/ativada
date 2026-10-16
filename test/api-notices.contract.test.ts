// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { NoticeSourceRow } from '../packages/database/src/notices/notice-feed.types.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  createNoticesHarness,
  type NoticesHarness,
} from './fixtures/api-routes/notices-harness.fixture.js';
import {
  HOUR,
  NOW,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  USER_A_ID,
  USER_B_ID,
} from './fixtures/api-routes/runs-harness.fixture.js';

const PATH = '/v1/notices';
const RUN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c0001';
const VERSION_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c00aa';
const MINUTE = 60_000;
const FIFTEEN_MINUTES = 15 * MINUTE;
const OWNER = userIdFromDatabase(USER_A_ID);
const STRANGER = userIdFromDatabase(USER_B_ID);

type ManualData = Record<string, unknown>;
type NoticeData = {
  manual: ManualData | null;
  noticeId: string;
  runId: string | null;
  kind: string;
  state: string;
  occurredAt: string;
  confirmsAt: string | null;
  expiresAt: string | null;
  price: string | null;
  resultRate: string | null;
  reasonCode: string;
  title: string;
  message: string;
  detail: string | null;
};
type NoticePage = {
  data: NoticeData[];
  pagination: { nextCursor: string | null; perPage: number };
};

let harness: NoticesHarness;

beforeAll(async () => {
  harness = await createNoticesHarness();
});

afterAll(async () => {
  await harness.stop();
});

// Cada teste anda dois minutos no relógio injetado: a cota de 60 consultas por minuto é medida nele.
beforeEach(() => {
  harness.clock.now += 2 * MINUTE;
});

function row(overrides: Partial<NoticeSourceRow>): NoticeSourceRow {
  return {
    noticeId: 'order:run:order-1',
    source: 'entry_order',
    occurredAt: NOW - HOUR,
    runId: RUN_ID,
    symbol: 'LINKUSDT',
    timeframe: '15m',
    candleTime: NOW - HOUR - FIFTEEN_MINUTES,
    expiresCandleTime: undefined,
    operationKey: 'position-1',
    state: 'created',
    reason: undefined,
    price: undefined,
    limitPrice: undefined,
    orderType: 'market',
    fee: undefined,
    quantity: undefined,
    netProfit: undefined,
    targetPrice: undefined,
    entryPrice: undefined,
    stopPrice: undefined,
    initialBalance: '10000',
    createdCandleTime: NOW - HOUR - 2 * FIFTEEN_MINUTES,
    notional: undefined,
    feeRate: '0.001',
    slippageRate: '0.0005',
    tickSize: '0.001',
    quantityStep: '0.01',
    strategyVersionId: VERSION_ID,
    ...overrides,
  };
}

async function list(query = '', subject: string | undefined = SUBJECT_A): Promise<NoticePage> {
  const response = await harness.call({ subject, path: `${PATH}${query}` });
  const { status, body } = await readJson(response);
  expect(status).toBe(200);
  return body as NoticePage;
}

const FILLED = row({
  state: 'filled',
  price: '12.45800000',
  fee: '0.01250000',
  quantity: '113.50000000',
  notional: '1414.00300000',
  targetPrice: '12.59000000',
  entryPrice: '12.45800000',
  stopPrice: '12.37900000',
});

describe('autenticação e forma', () => {
  test('exige token', async () => {
    expect((await harness.call({ path: PATH })).status).toBe(401);
  });

  test('sem avisos: lista vazia, sem cursor', async () => {
    const page = await list('', SUBJECT_B);
    expect(page.data).toEqual([]);
    expect(page.pagination).toEqual({ nextCursor: null, perPage: 30 });
  });
});

describe('o ciclo da ordem é UM aviso que muda de estado (RF03)', () => {
  test('pedida: diz quando executa, quando confirma e o que a cancelaria', async () => {
    harness.notices.put(OWNER, row({ state: 'created' }));
    const [notice] = (await list()).data;
    expect(notice?.kind).toBe('entry');
    expect(notice?.state).toBe('created');
    expect(notice?.reasonCode).toBe('entry.created');
    expect(notice?.title).toBe('Compra pedida');
    expect(notice?.message).toBe(
      'Executa pelo preço de abertura da vela das {abre}; a simulação confirma às {fecha}.',
    );
    expect(notice?.detail).toBe(
      'Vai cancelar? Cancela se a estratégia mudar de ideia no próximo fechamento, se a simulação for parada ou se faltarem dados do mercado.',
    );
    expect(notice?.price).toBeNull();
    expect(notice?.occurredAt).toBe(new Date(NOW - HOUR).toISOString());
    expect(notice?.confirmsAt).toBe(new Date(NOW - HOUR + FIFTEEN_MINUTES).toISOString());
  });

  test('executada: o MESMO noticeId troca de estado, com preço, alvo, proteção e taxa', async () => {
    harness.notices.put(OWNER, FILLED);
    const page = await list();
    expect(page.data).toHaveLength(1);
    const [notice] = page.data;
    expect(notice?.noticeId).toBe('order:run:order-1');
    expect(notice?.state).toBe('filled');
    expect(notice?.reasonCode).toBe('entry.filled');
    expect(notice?.title).toBe('Sinal de compra · executada');
    expect(notice?.message).toBe(
      'Sinal de compra: LINK/USDT a 12,458 · vender no alvo 12,590 · sair se cair a 12,379.',
    );
    expect(notice?.detail).toBe('Executada às {hora} · taxa 0,0125 USDT.');
    expect(notice?.price).toBe('12.45800000');
    expect(notice?.confirmsAt).toBeNull();
  });

  test('limitada pedida: a frase da validade e o limite no tick do par', async () => {
    harness.notices.put(
      OWNER,
      row({
        noticeId: 'order:run:limit',
        orderType: 'limit',
        limitPrice: '12.40000000',
        expiresCandleTime: NOW,
        occurredAt: NOW - 2 * HOUR,
      }),
    );
    const found = (await list()).data.find((entry) => entry.noticeId === 'order:run:limit');
    expect(found?.title).toBe('Compra pedida (limitada)');
    expect(found?.message).toBe(
      'Executa se o preço chegar a 12,400 até a vela das {validade}; senão, cancela.',
    );
    expect(found?.expiresAt).toBe(new Date(NOW + FIFTEEN_MINUTES).toISOString());
  });

  test.each([
    [
      'cancelled',
      'opposite_signal',
      'cancel.opposite_signal',
      'Compra cancelada',
      'A estratégia mudou de ideia antes de executar.',
    ],
    [
      'cancelled',
      'command',
      'cancel.command',
      'Ordem cancelada',
      'A simulação foi parada antes de executar.',
    ],
    [
      'cancelled',
      'gap',
      'expire.gap',
      'Ordem cancelada',
      'Faltaram dados do mercado na vela em que ia executar.',
    ],
    [
      'expired',
      'gap',
      'expire.gap',
      'Ordem cancelada',
      'Faltaram dados do mercado na vela em que ia executar.',
    ],
    [
      'expired',
      undefined,
      'expire.limit',
      'Compra cancelada',
      'O preço não chegou ao limite de 12,400 a tempo.',
    ],
    [
      'rejected',
      'zero_atr',
      'reject.zero_atr',
      'Compra não feita',
      'O mercado ficou parado demais para calcular a proteção.',
    ],
    [
      'rejected',
      'below_min_notional',
      'reject.below_min_notional',
      'Compra não feita',
      'O valor ficou abaixo do mínimo que a corretora aceita.',
    ],
    [
      'rejected',
      'invalid_stop',
      'reject.invalid_stop',
      'Compra não feita',
      'A saída de proteção ficaria acima do preço de compra.',
    ],
  ])('%s com motivo %s: %s', async (state, reason, code, title, message) => {
    const id = `order:run:${state}-${reason}`;
    harness.notices.put(
      OWNER,
      row({ noticeId: id, state, reason, limitPrice: '12.40000000', occurredAt: NOW - 3 * HOUR }),
    );
    const found = (await list('?limit=50')).data.find((entry) => entry.noticeId === id);
    expect(found?.reasonCode).toBe(code);
    expect(found?.title).toBe(title);
    expect(found?.message).toBe(message);
    expect(found?.state).toBe(state);
    expect(found?.detail).toBeNull();
  });
});

describe('saídas com motivo e resultado (RF04)', () => {
  const exit = (overrides: Partial<NoticeSourceRow>): NoticeSourceRow =>
    row({
      noticeId: `exit:run:${overrides.reason ?? 'x'}`,
      source: 'exit_position',
      state: undefined,
      price: '12.37200000',
      stopPrice: '12.37900000',
      targetPrice: '12.59000000',
      fee: '0.01240000',
      occurredAt: NOW - 30 * MINUTE,
      ...overrides,
    });

  test.each([
    [
      'stop',
      '-13.00000000',
      'exit.stop',
      'Sinal de venda · proteção',
      'Sinal de venda: sair a 12,372. Caiu até a saída de proteção (12,379).',
      'Resultado: −0,13% do saldo inicial da simulação · taxa 0,0124 USDT.',
    ],
    [
      'target',
      '106.00000000',
      'exit.target',
      'Sinal de venda · alvo',
      'Sinal de venda: sair a 12,372. Chegou ao alvo de lucro.',
      'Resultado: +1,06% do saldo inicial da simulação · taxa 0,0124 USDT.',
    ],
    [
      'signal',
      '0',
      'exit.signal',
      'Sinal de venda',
      'Sinal de venda: sair a 12,372. A estratégia virou para vender.',
      'Resultado: = 0,00% do saldo inicial da simulação · taxa 0,0124 USDT.',
    ],
    [
      'command',
      '5.00000000',
      'exit.command',
      'Sinal de venda · meta',
      'Sinal de venda: sair a 12,372. A meta chegou ao fim.',
      'Resultado: +0,05% do saldo inicial da simulação · taxa 0,0124 USDT.',
    ],
    [
      'gap',
      '-1.00000000',
      'exit.gap',
      'Sinal de venda · dados',
      'Sinal de venda: sair a 12,372. Faltaram dados do mercado.',
      'Resultado: −0,01% do saldo inicial da simulação · taxa 0,0124 USDT.',
    ],
  ])('%s', async (reason, netProfit, code, title, message, detail) => {
    harness.notices.put(OWNER, exit({ reason, netProfit }));
    const found = (await list('?limit=50')).data.find(
      (entry) => entry.noticeId === `exit:run:${reason}`,
    );
    expect(found?.kind).toBe('exit');
    expect(found?.reasonCode).toBe(code);
    expect(found?.title).toBe(title);
    expect(found?.message).toBe(message);
    expect(found?.detail).toBe(detail);
    expect(found?.price).toBe('12.37200000');
  });

  test('o resultado sobre o saldo arredonda para baixo e sai em fração exata', async () => {
    harness.notices.put(
      OWNER,
      exit({ noticeId: 'exit:run:rate', reason: 'stop', netProfit: '-12.57000000' }),
    );
    const found = (await list('?limit=50')).data.find(
      (entry) => entry.noticeId === 'exit:run:rate',
    );
    expect(found?.resultRate).toBe('-0.001257');
    expect(found?.detail?.startsWith('Resultado: −0,13%')).toBe(true);
  });
});

describe('parada, volta, espera, meta e alerta de preço', () => {
  test('cada origem tem a frase do catálogo', async () => {
    const at = NOW - 10 * MINUTE;
    const base = { runId: RUN_ID, orderType: undefined, occurredAt: at };
    harness.notices.put(OWNER, row({ ...base, noticeId: 'stalled:1', source: 'run_stalled' }));
    harness.notices.put(OWNER, row({ ...base, noticeId: 'resumed:1', source: 'run_resumed' }));
    harness.notices.put(OWNER, row({ ...base, noticeId: 'waiting:1', source: 'run_waiting' }));
    harness.notices.put(
      OWNER,
      row({ ...base, noticeId: 'goal:r', source: 'run_goal', state: 'goal_reached' }),
    );
    harness.notices.put(
      OWNER,
      row({ ...base, noticeId: 'goal:s', source: 'run_goal', state: 'goal_stopped' }),
    );
    harness.notices.put(
      OWNER,
      row({ ...base, noticeId: 'goal:e', source: 'run_goal', state: 'goal_expired' }),
    );
    harness.notices.put(
      OWNER,
      row({
        noticeId: 'price_alert:1',
        source: 'price_alert',
        runId: undefined,
        timeframe: undefined,
        reason: 'above',
        price: '70000.00000000',
        symbol: 'BTCUSDT',
        occurredAt: at,
      }),
    );
    harness.notices.put(
      OWNER,
      row({
        noticeId: 'price_alert:2',
        source: 'price_alert',
        runId: undefined,
        timeframe: undefined,
        reason: 'below',
        price: '12.00000000',
        symbol: 'LINKUSDT',
        occurredAt: at,
      }),
    );
    const byId = new Map((await list('?limit=50')).data.map((entry) => [entry.noticeId, entry]));
    expect(byId.get('stalled:1')?.message).toBe('A simulação não decidiu a vela das {hora}.');
    expect(byId.get('stalled:1')?.title).toBe('Simulação parada');
    expect(byId.get('resumed:1')?.message).toBe('Voltou a decidir.');
    expect(byId.get('waiting:1')?.message).toBe(
      'A simulação espera dados do mercado para continuar.',
    );
    expect(byId.get('goal:r')?.title).toBe('Meta alcançada');
    expect(byId.get('goal:s')?.message).toBe('A simulação parou na perda máxima aceita.');
    expect(byId.get('goal:e')?.message).toBe('O prazo da meta acabou.');
    expect(byId.get('price_alert:1')?.message).toBe('BTC/USDT passou de 70.000,00.');
    expect(byId.get('price_alert:1')?.runId).toBeNull();
    expect(byId.get('price_alert:2')?.message).toBe('LINK/USDT caiu abaixo de 12,000.');
    expect(byId.get('price_alert:1')?.kind).toBe('price_alert');
  });
});

describe('Operar à mão: o bloco manual (RF27 a RF34)', () => {
  const HISTORY = {
    strategyVersionId: VERSION_ID,
    symbol: 'LINKUSDT',
    timeframe: '15m',
    kind: 'backtest',
    elapsedMilliseconds: 183 * 86_400_000,
    totalReturn: '-0.143',
  };

  async function manualOf(noticeId: string): Promise<Record<string, unknown> | null | undefined> {
    const found = (await list('?limit=50')).data.find((entry) => entry.noticeId === noticeId);
    return found?.manual;
  }

  test('as contas à mão do exemplo: 113,50 LINK, custo 0,30%, líquido, 0,8 : 1 e equilíbrio 12,447', async () => {
    harness.notices.put(OWNER, row({ ...FILLED, noticeId: 'order:run:manual' }));
    harness.notices.putHistory(HISTORY);
    const manual = await manualOf('order:run:manual');
    expect(manual).toMatchObject({
      orderType: 'market',
      referencePrice: '12.45800000',
      quantity: '113.50000000',
      runBalance: '10000',
      notional: '1414.00300000',
      targetPrice: '12.59000000',
      stopPrice: '12.37900000',
      tickSize: '0.001',
      quantityStep: '0.01',
      costRate: '0.003',
      netGainRate: '0.007595',
      netLossRate: '-0.009342',
      netRatio: '0.8',
      breakEvenEntry: '12.447',
      history: { days: 183, netReturnRate: '-0.143' },
    });
    expect(manual?.['decidedAt']).toBe(
      new Date(NOW - HOUR - 2 * FIFTEEN_MINUTES + FIFTEEN_MINUTES).toISOString(),
    );
  });

  test('as frases do catálogo, contra o usuário: o ganho desce, a perda cresce, o equilíbrio vai para baixo no tick', async () => {
    const manual = await manualOf('order:run:manual');
    expect(manual?.['how']).toBe(
      'Ordem a mercado. Decidiu no fechamento das {decisao} e comprou pelo preço de abertura da vela das {decisao} (confirmado às {confirmacao}). Preço de referência: 12,458.',
    );
    expect(manual?.['quantityText']).toBe(
      'A simulação comprou 113,50 LINK (≈ 1.414,00 USDT) com saldo de 10.000,00 USDT. A quantidade real depende do seu saldo e da sua corretora.',
    );
    expect(manual?.['costText']).toBe(
      'Custo estimado ida e volta: 0,30% (taxa 0,1% + deslizamento 0,05% por lado, os da simulação).',
    );
    expect(manual?.['netText']).toBe(
      'Ganho possível depois do custo: +0,75% · perda possível depois do custo: −0,94% · ganho ÷ perda 0,8 : 1.',
    );
    expect(manual?.['giveUpText']).toBe(
      'A simulação compra a mercado e não desiste pelo preço. Para quem opera à mão: acima de 12,447 o ganho depois do custo já fica menor que a perda (este sinal entrou acima disso). Não é regra da simulação.',
    );
    expect(manual?.['historyText']).toBe('Últimos 183 dias, LINK/USDT 15 min, com taxas: −14,30%.');
    expect(manual?.['honesty']).toBe(
      'A simulação executa sem atraso e sem a oscilação de preço real. À mão haverá diferença (deslizamento e atraso) e você pode perder dinheiro. O AtivAdA não envia ordens e não tem chave da sua corretora.',
    );
  });

  test('par sem backtest: history nulo e a frase manda rodar um backtest', async () => {
    harness.notices.put(
      OWNER,
      row({
        ...FILLED,
        noticeId: 'order:run:other-pair',
        symbol: 'SOLUSDT',
        strategyVersionId: VERSION_ID,
      }),
    );
    const manual = await manualOf('order:run:other-pair');
    expect(manual?.['history']).toBeNull();
    expect(manual?.['historyText']).toBe('Sem histórico deste par. Rode um backtest em Backtests.');
  });

  test('a saída também traz o bloco, sem a frase da quantidade comprada', async () => {
    harness.notices.put(
      OWNER,
      row({
        ...FILLED,
        noticeId: 'exit:run:manual',
        source: 'exit_position',
        state: undefined,
        reason: 'target',
        netProfit: '106.00000000',
        price: '12.59000000',
        orderType: undefined,
      }),
    );
    const manual = await manualOf('exit:run:manual');
    expect(manual?.['referencePrice']).toBe('12.45800000');
    expect(manual?.['quantityText']).toBeNull();
    expect(manual?.['how']).toBeNull();
    expect(manual?.['breakEvenEntry']).toBe('12.447');
  });

  test('limitada: a frase diz o limite; sem taxa gravada, sem conta de custo', async () => {
    harness.notices.put(
      OWNER,
      row({
        ...FILLED,
        noticeId: 'order:run:limit-manual',
        orderType: 'limit',
        feeRate: undefined,
      }),
    );
    const manual = await manualOf('order:run:limit-manual');
    expect(String(manual?.['how'])).toContain('Ordem limitada em 12,458.');
    expect(manual?.['costRate']).toBeNull();
    expect(manual?.['costText']).toBeNull();
    expect(manual?.['netText']).toBeNull();
  });

  test('pedida, cancelada e os avisos de parada não levam o bloco', async () => {
    harness.notices.put(OWNER, row({ noticeId: 'order:run:pending-manual' }));
    harness.notices.put(OWNER, row({ noticeId: 'stalled:manual', source: 'run_stalled' }));
    expect(await manualOf('order:run:pending-manual')).toBeNull();
    expect(await manualOf('stalled:manual')).toBeNull();
  });

  test('as frases do bloco passam na varredura de palavras proibidas e não levam horário', async () => {
    const manual = await manualOf('order:run:manual');
    const phrases = [
      'how',
      'quantityText',
      'costText',
      'netText',
      'giveUpText',
      'historyText',
      'honesty',
    ];
    const texts = phrases.map((key) => String(manual?.[key]));
    const forbidden = [
      'você deve',
      'compre agora',
      'venda agora',
      'garant',
      'oportunidade',
      'lucro certo',
      'recomend',
      'certeza',
      'ATR',
      'stop',
    ];
    for (const text of texts) {
      expect(/\b\d{1,2}:\d{2}\b/.test(text)).toBe(false);
      for (const word of forbidden) expect(text.includes(word)).toBe(false);
    }
  });
});

describe('recorte, página e cursores', () => {
  test('scope separa simulações de alertas de preço', async () => {
    const runs = (await list('?scope=runs&limit=50')).data;
    const prices = (await list('?scope=price-alerts&limit=50')).data;
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((entry) => entry.kind !== 'price_alert')).toBe(true);
    expect(prices).toHaveLength(2);
    expect(prices.every((entry) => entry.kind === 'price_alert')).toBe(true);
  });

  test('decrescente por horário; a página seguinte continua a lista sem repetir', async () => {
    const all = (await list('?limit=50')).data;
    const times = all.map((entry) => Date.parse(entry.occurredAt));
    expect(times).toEqual([...times].sort((left, right) => right - left));
    const first = await list('?limit=4');
    expect(first.data).toHaveLength(4);
    expect(first.pagination.nextCursor).not.toBeNull();
    const second = await list(`?limit=4&cursor=${first.pagination.nextCursor}`);
    expect([...first.data, ...second.data].map((entry) => entry.noticeId)).toEqual(
      all.slice(0, 8).map((entry) => entry.noticeId),
    );
  });

  test('after devolve só os mais novos que o cursor (o resumo na volta)', async () => {
    const page = await list('?limit=3');
    const cursor = page.pagination.nextCursor;
    expect(cursor).not.toBeNull();
    const newer = await list(`?after=${cursor}`);
    expect(newer.data.map((entry) => entry.noticeId)).toEqual(
      page.data.slice(0, 2).map((entry) => entry.noticeId),
    );
    expect(newer.pagination.nextCursor).toBeNull();
  });

  test('a consulta lê só 30 dias e um aviso a mais que o pedido', async () => {
    await list('?limit=7');
    const params = harness.notices.lastParams();
    expect(params?.since).toBe(harness.clock.now - 30 * 24 * HOUR);
    expect(params?.limit).toBe(8);
  });

  test.each([
    ['limit=0'],
    ['limit=51'],
    ['limit=abc'],
    ['scope=outro'],
    ['cursor=%%%'],
    ['after=nao-e-cursor'],
    ['limit=2&limit=3'],
    ['extra=1'],
  ])('consulta inválida %s é 400', async (query) => {
    const response = await harness.call({ subject: SUBJECT_A, path: `${PATH}?${query}` });
    expect(response.status).toBe(400);
  });

  test('cursor e after juntos são 400', async () => {
    const page = await list('?limit=2');
    const cursor = page.pagination.nextCursor;
    const response = await harness.call({
      subject: SUBJECT_A,
      path: `${PATH}?cursor=${cursor}&after=${cursor}`,
    });
    expect(response.status).toBe(400);
  });
});

describe('isolamento entre usuários', () => {
  test('o outro usuário não vê nenhum aviso, nem pelo cursor do dono', async () => {
    harness.notices.put(
      STRANGER,
      row({ noticeId: 'order:run:stranger', state: 'filled', price: '1.00000000' }),
    );
    const ownerIds = (await list('?limit=50')).data.map((entry) => entry.noticeId);
    const strangerIds = (await list('?limit=50', SUBJECT_B)).data.map((entry) => entry.noticeId);
    expect(strangerIds).toEqual(['order:run:stranger']);
    expect(ownerIds).not.toContain('order:run:stranger');
    const cursor = (await list('?limit=2')).pagination.nextCursor;
    const withOwnerCursor = await list(`?cursor=${cursor}`, SUBJECT_B);
    const leaked = withOwnerCursor.data.filter((entry) => ownerIds.includes(entry.noticeId));
    expect(leaked).toEqual([]);
  });
});

describe('catálogo: nenhuma frase com hora nem palavra proibida (RF17)', () => {
  const FORBIDDEN = [
    'você deve',
    'compre agora',
    'venda agora',
    'garant',
    'oportunidade',
    'lucro certo',
    'recomend',
    'certeza',
    'ATR',
    'stop',
  ];
  const CLOCK = /\b\d{1,2}:\d{2}\b/;

  test('todas as frases devolvidas passam na varredura', async () => {
    const texts = (await list('?limit=50')).data.flatMap((entry) => [
      entry.title,
      entry.message,
      entry.detail ?? '',
    ]);
    expect(texts.length).toBeGreaterThan(30);
    for (const text of texts) {
      expect(CLOCK.test(text)).toBe(false);
      for (const word of FORBIDDEN) expect(text.includes(word)).toBe(false);
    }
  });
});

describe('política de taxa NOTICES', () => {
  test('60 por minuto por usuário; a seguinte é 429 com Retry-After', async () => {
    const results: number[] = [];
    for (let attempt = 0; attempt < 61; attempt += 1) {
      const response = await harness.call({ subject: SUBJECT_B, path: `${PATH}?limit=1` });
      results.push(response.status);
    }
    expect(results.slice(0, 60).every((status) => status === 200)).toBe(true);
    expect(results[60]).toBe(429);
  });
});
