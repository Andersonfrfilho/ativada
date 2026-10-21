// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { DecisionMessageParams } from '../apps/api-ativada/src/runs/live-status/decision-messages.js';
import type { PositionInput } from '../packages/database/src/index.js';
import {
  createStrategyVersion,
  type SignalVote,
  type StrategyConfig,
  type StrategyConfigInput,
  type StrategyRule,
} from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

// As frases vêm dos módulos carregados pela raiz da API (os de produção, ou a cópia mutada do teste de mutantes).
const app = await loadApiApp();
const { buildDecisionMessage, resolveDecisionOutcome } = app.decisionMessages;
const { describeRuleCondition } = app.decisionCondition;

const RISK = {
  atrPeriod: 14,
  stopAtrMultiple: '2',
  targetAtrMultiple: '3',
  riskPerTrade: '0.01',
  maxExposureRate: '1',
} as const;

function configOf(
  rules: StrategyConfigInput['rules'],
  thresholds = { buy: '2', sell: '-2' },
): StrategyConfig {
  return createStrategyVersion({ schemaVersion: 1, rules, thresholds, risk: RISK }).config;
}

const DONCHIAN = { id: 'donchian-20', kind: 'donchian_breakout', period: 20 } as const;
const EMA = { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 } as const;
const MACD = {
  id: 'macd-12-26-9',
  kind: 'macd',
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
} as const;
const RSI = { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 } as const;
const BOLLINGER = { id: 'bollinger-20', kind: 'bollinger', period: 20, deviations: '2' } as const;
const OBV = { id: 'obv-ema-10', kind: 'obv_trend', emaPeriod: 10 } as const;
const FEAR_GREED = {
  id: 'fear-greed',
  kind: 'fear_greed',
  fearAtOrBelow: 30,
  greedAtOrAbove: 70,
} as const;

function voteOf(
  ruleId: string,
  vote: SignalVote['vote'],
  extra: Partial<SignalVote> = {},
): SignalVote {
  return { ruleId, family: 'trend', vote, weight: '1', isMissing: false, ...extra };
}

function messageOf(
  overrides: Partial<DecisionMessageParams> & Pick<DecisionMessageParams, 'config' | 'votes'>,
): string {
  const action = overrides.action ?? 'HOLD';
  const isHolding = overrides.isHolding ?? false;
  const outcome =
    action === 'BUY' && !isHolding ? 'bought' : action === 'SELL' && isHolding ? 'sold' : 'waited';
  return buildDecisionMessage({
    action,
    isHolding,
    outcome,
    exit: undefined,
    score: '0',
    indicators: {},
    ...overrides,
  });
}

const THREE = configOf([DONCHIAN, EMA, MACD]);

describe('o motivo da vela quando esperou sem posição (L14)', () => {
  test('o exemplo da spec: falta 1 ponto e a regra que segurou é o MACD', () => {
    expect(
      messageOf({
        config: THREE,
        score: '1',
        votes: [voteOf('donchian-20', 1), voteOf('ema-9-21', 1), voteOf('macd-12-26-9', -1)],
      }),
    ).toBe('Faltou 1 ponto: o MACD ainda está abaixo da linha de sinal.');
  });

  test('plural e decimal: 1,5 ponto vira "pontos"; com 0,5 também', () => {
    const votes = [voteOf('donchian-20', 0), voteOf('ema-9-21', 0), voteOf('macd-12-26-9', 0)];
    expect(messageOf({ config: THREE, score: '0.5', votes })).toBe(
      'Faltou 1,5 pontos: o preço não fechou acima da máxima das últimas 20 velas.',
    );
    expect(messageOf({ config: THREE, score: '1.5', votes })).toBe(
      'Faltou 0,5 pontos: o preço não fechou acima da máxima das últimas 20 velas.',
    );
    expect(messageOf({ config: THREE, score: '0', votes })).toContain('Faltou 2 pontos:');
  });

  test('a regra de maior peso entre as que não votaram a favor; empate fica com a primeira da configuração', () => {
    const heaviest = [
      voteOf('donchian-20', 0, { weight: '1' }),
      voteOf('ema-9-21', -1, { weight: '1.5' }),
      voteOf('macd-12-26-9', 1, { weight: '3' }),
    ];
    expect(messageOf({ config: THREE, score: '0', votes: heaviest })).toBe(
      'Faltou 2 pontos: a média rápida (EMA 9) está abaixo da lenta (EMA 21).',
    );
    const tie = [
      voteOf('donchian-20', 1),
      voteOf('ema-9-21', 0, { weight: '2' }),
      voteOf('macd-12-26-9', -1, { weight: '2' }),
    ];
    expect(messageOf({ config: THREE, score: '1', votes: tie })).toBe(
      'Faltou 1 ponto: as médias estão empatadas.',
    );
  });

  test('o filtro de regime (peso zero) tira a regra da explicação e é citado', () => {
    const config = configOf([DONCHIAN, BOLLINGER]);
    expect(
      messageOf({
        config,
        score: '1',
        votes: [
          voteOf('donchian-20', 1),
          voteOf('bollinger-20', -1, { family: 'reversion', weight: '0' }),
        ],
      }),
    ).toBe('Faltou 1 ponto. O filtro de tendência (ADX) deixou Bollinger 20/2 de fora.');
    const withHolder = messageOf({
      config: configOf([DONCHIAN, EMA, BOLLINGER]),
      score: '1',
      votes: [
        voteOf('donchian-20', 1),
        voteOf('ema-9-21', 0),
        voteOf('bollinger-20', -1, { family: 'reversion', weight: '0' }),
      ],
    });
    expect(withHolder).toBe(
      'Faltou 1 ponto: as médias estão empatadas. O filtro de tendência (ADX) deixou Bollinger 20/2 de fora.',
    );
  });

  test('sentimento sem leitura em 48 h: a regra fica neutra e a frase diz isso', () => {
    const config = configOf([EMA, FEAR_GREED]);
    expect(
      messageOf({
        config,
        score: '1',
        votes: [
          voteOf('ema-9-21', 1),
          voteOf('fear-greed', 0, { family: 'sentiment', isMissing: true }),
        ],
      }),
    ).toBe('Faltou 1 ponto. Sem leitura do Fear & Greed nas últimas 48 h: a regra ficou neutra.');
  });

  test('leituras do RSI e do Fear & Greed entram na frase com uma casa', () => {
    const config = configOf([RSI, FEAR_GREED], { buy: '1', sell: '-1' });
    expect(
      messageOf({
        config,
        score: '0',
        indicators: { 'rule:rsi-14': 45.37 },
        votes: [
          voteOf('rsi-14', 0, { family: 'reversion' }),
          voteOf('fear-greed', 0, { family: 'sentiment', weight: '0.5' }),
        ],
      }),
    ).toBe('Faltou 1 ponto: o RSI (45,4) está entre 30 e 70.');
    expect(
      messageOf({
        config,
        score: '0',
        indicators: { 'rule:fear-greed': 82 },
        votes: [
          voteOf('rsi-14', 1, { family: 'reversion' }),
          voteOf('fear-greed', -1, { family: 'sentiment' }),
        ],
      }),
    ).toBe('Faltou 1 ponto: o Fear & Greed (82) está em ganância (a partir de 70).');
  });

  test('todas a favor mas abaixo do limiar: só a falta, sem inventar uma regra', () => {
    expect(
      messageOf({
        config: configOf([DONCHIAN, EMA], { buy: '3', sell: '-3' }),
        score: '2',
        votes: [voteOf('donchian-20', 1), voteOf('ema-9-21', 1)],
      }),
    ).toBe('Faltou 1 ponto.');
  });
});

describe('comprou, vendeu e esperou com posição (L14)', () => {
  const twoRules = configOf([DONCHIAN, MACD]);

  test('comprou: quantas regras e quais', () => {
    expect(
      messageOf({
        config: twoRules,
        action: 'BUY',
        score: '2',
        votes: [voteOf('donchian-20', 1), voteOf('macd-12-26-9', 1)],
      }),
    ).toBe('Comprou: 2 de 2 regras a favor (Donchian 20 e MACD 12/26/9).');
    expect(
      messageOf({
        config: THREE,
        action: 'BUY',
        score: '2',
        votes: [voteOf('donchian-20', 1), voteOf('ema-9-21', 1), voteOf('macd-12-26-9', 0)],
      }),
    ).toBe('Comprou: 2 de 3 regras a favor (Donchian 20 e EMA 9×21).');
    expect(
      messageOf({
        config: THREE,
        action: 'BUY',
        score: '3',
        votes: [voteOf('donchian-20', 1), voteOf('ema-9-21', 1), voteOf('macd-12-26-9', 1)],
      }),
    ).toBe('Comprou: 3 de 3 regras a favor (Donchian 20, EMA 9×21 e MACD 12/26/9).');
  });

  test('vendeu: quantas regras contra e quais', () => {
    expect(
      messageOf({
        config: twoRules,
        action: 'SELL',
        isHolding: true,
        score: '-2',
        votes: [voteOf('donchian-20', -1), voteOf('macd-12-26-9', -1)],
      }),
    ).toBe('Vendeu: 2 de 2 regras contra (Donchian 20 e MACD 12/26/9).');
  });

  test('comprada e esperando: a venda pede a pontuação do limiar', () => {
    expect(
      messageOf({
        config: twoRules,
        isHolding: true,
        score: '0',
        votes: [voteOf('donchian-20', 0), voteOf('macd-12-26-9', 0)],
      }),
    ).toBe('Esperou: já está comprada; a venda pede pontuação −2 e está em 0.');
  });

  test('a compra não se repete e não há o que vender', () => {
    const votes = [voteOf('donchian-20', 1), voteOf('macd-12-26-9', 1)];
    expect(messageOf({ config: twoRules, action: 'BUY', isHolding: true, score: '2', votes })).toBe(
      'Esperou: já está comprada; a compra não se repete.',
    );
    expect(
      messageOf({ config: twoRules, action: 'SELL', isHolding: false, score: '-2', votes }),
    ).toBe('Esperou: não há posição para vender.');
  });

  test('o filtro de regime também é citado ao comprar', () => {
    expect(
      messageOf({
        config: configOf([DONCHIAN, BOLLINGER]),
        action: 'BUY',
        score: '2',
        votes: [
          voteOf('donchian-20', 1, { weight: '2' }),
          voteOf('bollinger-20', 1, { family: 'reversion', weight: '0' }),
        ],
      }),
    ).toBe(
      'Comprou: 1 de 1 regra a favor (Donchian 20). O filtro de tendência (ADX) deixou Bollinger 20/2 de fora.',
    );
  });
});

const STATE = {
  isHolding: false,
  isBuyFilled: false,
  isLastCandle: false,
  exit: undefined,
} as const;

describe('o desfecho da vela para a carteira (L12 e L21)', () => {
  test.each([
    ['BUY', { isHolding: false, isBuyFilled: true }, 'bought'],
    ['BUY', { isHolding: true, isBuyFilled: false }, 'waited'],
    ['BUY', { isHolding: false, isBuyFilled: false, isLastCandle: true }, 'buy_pending'],
    ['BUY', { isHolding: false, isBuyFilled: false }, 'waited'],
    ['SELL', { isHolding: true }, 'sold'],
    ['SELL', { isHolding: false }, 'waited'],
    ['HOLD', { isHolding: false }, 'waited'],
    ['HOLD', { isHolding: true }, 'waited'],
  ] as const)('%s com %o é %s', (action, partial, outcome) => {
    expect(resolveDecisionOutcome({ action, state: { ...STATE, ...partial } })).toBe(outcome);
  });

  test('a saída por alvo, stop, lacuna ou comando vence qualquer ação da vela', () => {
    const exit = positionOf('target');
    expect(resolveDecisionOutcome({ action: 'HOLD', state: { ...STATE, exit } })).toBe('exited');
    expect(resolveDecisionOutcome({ action: 'BUY', state: { ...STATE, exit } })).toBe('exited');
  });
});

function positionOf(exitReason: PositionInput['exitReason']): PositionInput {
  return {
    engineKey: 'p1',
    status: 'closed',
    entryPrice: '100',
    quantity: '1',
    stopPrice: '95.5',
    targetPrice: '11800.5',
    entryFee: '0',
    exitPrice: '100',
    exitFee: '0',
    netProfit: '0',
    exitReason,
    openedCandleTime: 0,
    closedCandleTime: 1,
  };
}

describe('a compra que não preencheu e as saídas sem sinal (L21)', () => {
  const votes = [voteOf('donchian-20', 1), voteOf('macd-12-26-9', 1)];
  const config = configOf([DONCHIAN, MACD]);

  test('BUY sem preenchimento: pendente na última vela, senão sinal sem execução', () => {
    const params = { config, action: 'BUY', score: '2', votes } as const;
    expect(messageOf({ ...params, outcome: 'buy_pending' })).toBe(
      'Pediu compra: executa na abertura da próxima vela.',
    );
    expect(messageOf({ ...params, outcome: 'waited' })).toBe('Sinal de compra sem execução.');
  });

  test.each([
    ['target', 'Vendeu no alvo (11.800,50).'],
    ['stop', 'Vendeu no stop (95,50).'],
    ['gap', 'Saiu pela lacuna de dados.'],
    ['command', 'Saiu porque a meta terminou.'],
  ] as const)('saída por %s', (reason, expected) => {
    expect(messageOf({ config, votes, outcome: 'exited', exit: positionOf(reason) })).toBe(
      expected,
    );
  });
});

const RULE_BY_ID: Readonly<Record<string, StrategyRule>> = Object.fromEntries(
  [DONCHIAN, EMA, MACD, RSI, BOLLINGER, OBV, FEAR_GREED].map((rule) => [rule.id, rule]),
);

describe('a condição de cada tipo de regra, contra e neutra (L15)', () => {
  test.each([
    ['ema-9-21', -1, undefined, 'a média rápida (EMA 9) está abaixo da lenta (EMA 21)'],
    ['ema-9-21', 0, undefined, 'as médias estão empatadas'],
    ['macd-12-26-9', -1, undefined, 'o MACD ainda está abaixo da linha de sinal'],
    ['macd-12-26-9', 0, undefined, 'o MACD está igual à linha de sinal'],
    ['donchian-20', -1, undefined, 'o preço fechou abaixo da mínima das últimas 20 velas'],
    ['donchian-20', 0, undefined, 'o preço não fechou acima da máxima das últimas 20 velas'],
    ['rsi-14', -1, 78.04, 'o RSI (78) está acima de 70'],
    ['rsi-14', 0, 52.5, 'o RSI (52,5) está entre 30 e 70'],
    ['bollinger-20', -1, undefined, 'o preço fechou acima da banda superior'],
    ['bollinger-20', 0, undefined, 'o preço está dentro das bandas'],
    ['obv-ema-10', -1, undefined, 'o volume (OBV) está abaixo da média dele'],
    ['obv-ema-10', 0, undefined, 'o volume (OBV) está igual à média dele'],
    ['fear-greed', -1, 81, 'o Fear & Greed (81) está em ganância (a partir de 70)'],
    ['fear-greed', 0, 50, 'o Fear & Greed (50) não está em medo (até 30)'],
  ] as const)('%s com voto %i', (ruleId, vote, reading, expected) => {
    const rule = RULE_BY_ID[ruleId];
    if (rule === undefined) throw new Error(`regra ${ruleId} ausente`);
    expect(describeRuleCondition({ rule, vote, reading })).toBe(expected);
  });

  test('sem leitura gravada, a frase sai sem o valor entre parênteses', () => {
    const rule = RULE_BY_ID['rsi-14'];
    if (rule === undefined) throw new Error('regra rsi-14 ausente');
    expect(describeRuleCondition({ rule, vote: 0, reading: undefined })).toBe(
      'o RSI está entre 30 e 70',
    );
  });
});
