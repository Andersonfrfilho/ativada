// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type {
  NextTriggers,
  RuleTrigger,
  TriggerState,
} from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

// As frases vêm do módulo carregado pela raiz da API (o de produção, ou a cópia mutada do teste de mutantes).
const app = await loadApiApp();
const { buildTriggerRuleMessage, buildTriggersMessage, buildTriggersUnavailableMessage } =
  app.triggerMessages;

const NOT_A_FORECAST =
  'Isto não é previsão: o preço pode nunca chegar lá, e outras regras podem mudar de voto antes.';
const INDICATIVE_NOTE = ' (aproximado: o indicador se move com a próxima vela)';

function ruleOf(overrides: Partial<RuleTrigger>): RuleTrigger {
  return {
    ruleId: 'rule-1',
    kind: 'rsi',
    family: 'reversion',
    vote: 0,
    weight: '1',
    isMet: false,
    metric: 'rsi',
    direction: 'below',
    basis: 'exact',
    current: '45',
    threshold: '30',
    distance: '15',
    distanceRate: null,
    ...overrides,
  };
}

function messageOf(
  rule: Partial<RuleTrigger>,
  label: string,
  state: TriggerState = 'awaiting_entry',
): string {
  return buildTriggerRuleMessage({ rule: ruleOf(rule), label, state });
}

describe('o que falta para cada regra votar (L15)', () => {
  test('preço: fechar acima do limiar, com o valor de hoje e a distância arredondada para longe', () => {
    expect(
      messageOf(
        {
          metric: 'close_price',
          direction: 'above',
          current: '11.42',
          threshold: '11.8',
          distance: '0.38',
          distanceRate: '0.03327495',
        },
        'Donchian 20',
      ),
    ).toBe(
      'Donchian 20: o preço precisa fechar acima de 11,80 (no último fechamento 11,42, faltam 3,33%).',
    );
  });

  test('preço: abaixo do limiar, milhar com ponto e distância com uma casa quando não há mais', () => {
    expect(
      messageOf(
        {
          metric: 'close_price',
          direction: 'below',
          current: '65432.1',
          threshold: '62160.5',
          distanceRate: '0.05',
        },
        'Bollinger 20/2',
      ),
    ).toBe(
      'Bollinger 20/2: o preço precisa fechar abaixo de 62.160,50 (no último fechamento 65.432,10, faltam 5%).',
    );
  });

  test('preço sem leitura de hoje: só o limiar', () => {
    expect(
      messageOf(
        { metric: 'close_price', direction: 'above', current: null, threshold: '11.8' },
        'EMA 9×21',
      ),
    ).toBe('EMA 9×21: o preço precisa fechar acima de 11,80.');
  });

  test.each([
    ['rsi', 'below', '30', 'RSI 14: o RSI precisa ficar abaixo de 30.'],
    ['rsi', 'above', '70', 'RSI 14: o RSI precisa ficar acima de 70.'],
    ['macd_gap', 'above', '0', 'RSI 14: o MACD precisa passar a linha de sinal.'],
    ['obv_gap', 'above', '0', 'RSI 14: o OBV precisa passar a média dele.'],
    ['fear_greed_index', 'below', '30', 'RSI 14: o Fear & Greed precisa chegar a 30 ou menos.'],
    ['fear_greed_index', 'above', '70', 'RSI 14: o Fear & Greed precisa chegar a 70 ou mais.'],
  ] as const)('%s no sentido %s', (metric, direction, threshold, expected) => {
    expect(messageOf({ metric, direction, threshold }, 'RSI 14')).toBe(expected);
  });

  test('conta aproximada acrescenta o aviso antes do ponto final', () => {
    expect(
      messageOf(
        { metric: 'macd_gap', direction: 'above', threshold: '0', basis: 'indicative' },
        'MACD 12/26/9',
      ),
    ).toBe(`MACD 12/26/9: o MACD precisa passar a linha de sinal${INDICATIVE_NOTE}.`);
  });

  test('regra que já vota a favor diz isso, no estado da carteira', () => {
    expect(messageOf({ isMet: true }, 'EMA 9×21')).toBe('EMA 9×21: já vota para comprar.');
    expect(messageOf({ isMet: true }, 'EMA 9×21', 'holding')).toBe(
      'EMA 9×21: já vota para vender.',
    );
  });

  test('sem limiar (sentimento sem leitura) a frase não inventa um número', () => {
    expect(
      messageOf({ metric: 'fear_greed_index', current: null, threshold: null }, 'Fear & Greed'),
    ).toBe('Fear & Greed: ainda não há leitura para dizer o que falta.');
  });
});

function triggersOf(overrides: Partial<NextTriggers>): NextTriggers {
  return {
    version: 'trigger-1',
    state: 'awaiting_entry',
    action: 'HOLD',
    score: '1',
    scoreThreshold: '2',
    scoreGap: '1',
    rules: [],
    ...overrides,
  };
}

describe('o que falta no placar e o aviso fixo (L11)', () => {
  test.each([
    [{ scoreGap: '1' }, `Faltam 1 ponto de 2 para comprar. ${NOT_A_FORECAST}`],
    [{ scoreGap: '1.5' }, `Faltam 1,5 pontos de 2 para comprar. ${NOT_A_FORECAST}`],
    [{ scoreGap: '2' }, `Faltam 2 pontos de 2 para comprar. ${NOT_A_FORECAST}`],
    [
      { state: 'holding', score: '-1', scoreThreshold: '-2', scoreGap: '1' },
      `Faltam 1 ponto de −2 para vender. ${NOT_A_FORECAST}`,
    ],
    [{ scoreGap: '0' }, `A pontuação já alcança o limiar de compra. ${NOT_A_FORECAST}`],
    [{ scoreGap: '-1' }, `A pontuação já alcança o limiar de compra. ${NOT_A_FORECAST}`],
    [
      { state: 'holding', scoreThreshold: '-2', scoreGap: '0' },
      `A pontuação já alcança o limiar de venda. ${NOT_A_FORECAST}`,
    ],
  ] as const)('%j', (overrides, expected) => {
    expect(buildTriggersMessage(triggersOf(overrides))).toBe(expected);
  });
});

describe('por que não há gatilho (L3)', () => {
  test.each([
    ['queued', 'Sem gatilhos agora: a simulação está na fila.'],
    ['completed', 'Sem gatilhos agora: a simulação foi concluída.'],
    ['failed', 'Sem gatilhos agora: a simulação terminou com falha.'],
    ['cancelled', 'Sem gatilhos agora: a simulação foi parada.'],
  ] as const)('simulação %s', (runStatus, expected) => {
    expect(buildTriggersUnavailableMessage({ reason: 'not_running', runStatus })).toBe(expected);
  });

  test('sem vela fechada e aquecendo (Donchian espera a segunda vela decidida)', () => {
    expect(buildTriggersUnavailableMessage({ reason: 'no_candle', runStatus: 'running' })).toBe(
      'Aguardando a primeira vela fechar.',
    );
    expect(buildTriggersUnavailableMessage({ reason: 'warming_up', runStatus: 'running' })).toBe(
      'O gatilho do rompimento precisa de duas velas decididas; aparece no próximo fechamento.',
    );
  });
});
