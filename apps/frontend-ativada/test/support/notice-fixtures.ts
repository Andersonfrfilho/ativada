// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Notice } from '../../src/notices/notice.validation.js';
import { pageResponse, type FakeRoute } from './fake-fetch.js';

export const NOTICE_RUN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c0001';
export const OTHER_RUN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c0002';
export const NOTICE_NOW = Date.parse('2026-10-16T20:20:00.000Z');
export const MINUTE = 60_000;

// Os horários saem em UTC no servidor; o painel de teste mostra UTC (o perfil não carrega no teste).
export function buildNotice(overrides: Partial<Notice> = {}): Notice {
  return {
    noticeId: 'order:run:order-1',
    runId: NOTICE_RUN_ID,
    symbol: 'LINKUSDT',
    timeframe: '15m',
    kind: 'entry',
    state: 'created',
    occurredAt: new Date(NOTICE_NOW - 5 * MINUTE).toISOString(),
    candleTime: NOTICE_NOW - 20 * MINUTE,
    confirmsAt: new Date(NOTICE_NOW + 10 * MINUTE).toISOString(),
    expiresAt: null,
    operationKey: null,
    price: null,
    limitPrice: null,
    fee: null,
    resultRate: null,
    targetPrice: null,
    entryPrice: null,
    stopPrice: null,
    reasonCode: 'entry.created',
    title: 'Compra pedida',
    message: 'Executa pelo preço de abertura da vela das {abre}; a simulação confirma às {fecha}.',
    manual: null,
    detail:
      'Vai cancelar? Cancela se a estratégia mudar de ideia no próximo fechamento, se a simulação for parada ou se faltarem dados do mercado.',
    ...overrides,
  };
}

// As contas do exemplo da spec (LINK/USDT 15 min, 113,50 LINK, saldo de 10.000 USDT).
export function buildManual(
  overrides: Partial<NonNullable<Notice['manual']>> = {},
): NonNullable<Notice['manual']> {
  return {
    orderType: 'market',
    decidedAt: new Date(NOTICE_NOW - 5 * MINUTE).toISOString(),
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
    how: 'Ordem a mercado. Decidiu no fechamento das {decisao} e comprou pelo preço de abertura da vela das {decisao} (confirmado às {confirmacao}). Preço de referência: 12,458.',
    quantityText:
      'A simulação comprou 113,50 LINK (≈ 1.414,00 USDT) com saldo de 10.000,00 USDT. A quantidade real depende do seu saldo e da sua corretora.',
    costText:
      'Custo estimado ida e volta: 0,30% (taxa 0,1% + deslizamento 0,05% por lado, os da simulação).',
    netText:
      'Ganho possível depois do custo: +0,75% · perda possível depois do custo: −0,94% · ganho ÷ perda 0,8 : 1.',
    giveUpText:
      'A simulação compra a mercado e não desiste pelo preço. Para quem opera à mão: acima de 12,447 o ganho depois do custo já fica menor que a perda (este sinal entrou acima disso). Não é regra da simulação.',
    historyText: 'Últimos 183 dias, LINK/USDT 15 min, com taxas: −14,30%.',
    honesty:
      'A simulação executa sem atraso e sem a oscilação de preço real. À mão haverá diferença (deslizamento e atraso) e você pode perder dinheiro. O AtivAdA não envia ordens e não tem chave da sua corretora.',
    ...overrides,
  };
}

export function buildFilledNotice(overrides: Partial<Notice> = {}): Notice {
  return buildNotice({
    state: 'filled',
    confirmsAt: null,
    price: '12.45800000',
    fee: '0.01250000',
    targetPrice: '12.59000000',
    entryPrice: '12.45800000',
    stopPrice: '12.37900000',
    operationKey: 'position-1',
    manual: buildManual(),
    reasonCode: 'entry.filled',
    title: 'Sinal de compra · executada',
    message: 'Sinal de compra: LINK/USDT a 12,458 · vender no alvo 12,590 · sair se cair a 12,379.',
    detail: 'Executada às {hora} · taxa 0,0125 USDT.',
    ...overrides,
  });
}

export function buildCancelledNotice(overrides: Partial<Notice> = {}): Notice {
  return buildNotice({
    noticeId: 'order:run:order-2',
    state: 'cancelled',
    confirmsAt: null,
    reasonCode: 'cancel.opposite_signal',
    title: 'Compra cancelada',
    message: 'A estratégia mudou de ideia antes de executar.',
    detail: null,
    ...overrides,
  });
}

export function buildExitNotice(overrides: Partial<Notice> = {}): Notice {
  return buildNotice({
    noticeId: 'exit:run:position-1',
    kind: 'exit',
    state: 'done',
    confirmsAt: null,
    price: '12.37200000',
    targetPrice: '12.59000000',
    entryPrice: '12.45800000',
    stopPrice: '12.37900000',
    resultRate: '-0.0013',
    reasonCode: 'exit.stop',
    title: 'Sinal de venda · proteção',
    message: 'Sinal de venda: sair a 12,372. Caiu até a saída de proteção (12,379).',
    detail: 'Resultado: −0,13% do saldo inicial da simulação · taxa 0,0124 USDT.',
    ...overrides,
  });
}

export type NoticeFeedScript = {
  runs: readonly Notice[];
  prices: readonly Notice[];
  readonly route: readonly FakeRoute[];
};

// A rota `GET /v1/notices` do teste: devolve a lista atual do recorte pedido (muda quando o teste troca `runs`).
export function createNoticeFeed(
  initial: { runs?: readonly Notice[]; prices?: readonly Notice[] } = {},
): NoticeFeedScript {
  const script: NoticeFeedScript = {
    runs: initial.runs ?? [],
    prices: initial.prices ?? [],
    route: [],
  };
  const route: FakeRoute = {
    method: 'GET',
    path: '/v1/notices',
    respond: (call) => {
      const scope = call.query.get('scope');
      return pageResponse(scope === 'price-alerts' ? script.prices : script.runs);
    },
  };
  return Object.assign(script, { route: [route] });
}
