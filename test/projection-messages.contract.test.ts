// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { COIN_FLIP_VERDICT } from '../packages/statistics/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import {
  PROJECTION_SIDE,
  PROJECTION_STANCE,
  PROJECTION_STRENGTH,
  PROJECTION_UNAVAILABLE_REASON,
} from '../apps/api-ativada/src/runs/projections/projections.constant.js';

const { projectionMessages } = await loadApiApp();
const { describeLabel, describeReason, describeSummary, describeUnavailable, describeVerdict } =
  projectionMessages;

describe('frases da previsão (ADR 0002, spec 009, P9)', () => {
  test('rótulo = postura + força, com as quatro posturas e as três forças', () => {
    const { BUY, HOLD, SELL, STAY_OUT } = PROJECTION_STANCE;
    const { WEAK, STRONG, DECIDED } = PROJECTION_STRENGTH;
    expect(describeLabel({ stance: BUY, strength: WEAK })).toBe('Tende a COMPRAR · fraco');
    expect(describeLabel({ stance: HOLD, strength: STRONG })).toBe('Tende a SEGURAR · forte');
    expect(describeLabel({ stance: SELL, strength: DECIDED })).toBe('Tende a VENDER · decidiu');
    expect(describeLabel({ stance: STAY_OUT, strength: WEAK })).toBe(
      'Tende a FICAR DE FORA · fraco',
    );
  });

  test('motivo com sinal explícito, menos tipográfico, vírgula decimal e sem zeros à direita', () => {
    const buy = PROJECTION_SIDE.BUY;
    const sell = PROJECTION_SIDE.SELL;
    expect(describeReason({ side: buy, score: '1', threshold: '2' })).toBe(
      'Placar +1 de +2 para comprar.',
    );
    expect(describeReason({ side: sell, score: '-1', threshold: '-2' })).toBe(
      'Placar −1 de −2 para vender.',
    );
    expect(describeReason({ side: buy, score: '1.50', threshold: '2.0' })).toBe(
      'Placar +1,5 de +2 para comprar.',
    );
    expect(describeReason({ side: sell, score: '-0.5', threshold: '-1.5' })).toBe(
      'Placar −0,5 de −1,5 para vender.',
    );
  });

  test('cada motivo de "sem previsão"; o "não está rodando" muda no histórico', () => {
    const { NEUTRAL, WARMING_UP, NO_CANDLE, NOT_RUNNING } = PROJECTION_UNAVAILABLE_REASON;
    expect(describeUnavailable({ reason: NEUTRAL, isLive: true })).toBe(
      'O placar está em 0: nenhuma regra puxa para um lado.',
    );
    expect(describeUnavailable({ reason: WARMING_UP, isLive: true })).toBe(
      'A estratégia ainda está juntando velas para calcular as regras.',
    );
    expect(describeUnavailable({ reason: NO_CANDLE, isLive: true })).toBe(
      'Aguardando a primeira vela fechar.',
    );
    expect(describeUnavailable({ reason: NOT_RUNNING, isLive: true })).toBe(
      'A simulação não está rodando: não há próxima decisão.',
    );
    expect(describeUnavailable({ reason: NOT_RUNNING, isLive: false })).toBe(
      'Este é um teste no histórico: não há próxima decisão. O histórico de acertos está abaixo.',
    );
  });

  test('resumo com o acerto em porcentagem ao lado da moeda ao ar', () => {
    expect(
      describeSummary({
        hits: 134,
        counted: 285,
        hitRate: '0.4701',
        upRate: '0.5368',
        insideRate: '0.8631',
      }),
    ).toBe(
      "Acertou o lado em 47,01% (134 de 285). Moeda ao ar: 50%. 'Sempre sobe': 53,68%. Dentro da faixa: 86,31%.",
    );
  });

  test('sem faixa a última frase sai; 0 e 1 viram 0,00% e 100,00%; sem contadas, a frase própria', () => {
    expect(
      describeSummary({ hits: 5, counted: 5, hitRate: '1', upRate: '0', insideRate: null }),
    ).toBe("Acertou o lado em 100,00% (5 de 5). Moeda ao ar: 50%. 'Sempre sobe': 0,00%.");
    expect(
      describeSummary({ hits: 0, counted: 0, hitRate: null, upRate: null, insideRate: null }),
    ).toBe('Nenhuma previsão com resultado ainda.');
  });

  test('uma frase por veredito', () => {
    expect(describeVerdict(COIN_FLIP_VERDICT.ABOVE)).toBe(
      'Até aqui, a tendência acertou o lado mais vezes que uma moeda ao ar.',
    );
    expect(describeVerdict(COIN_FLIP_VERDICT.EVEN)).toBe(
      'Até aqui, a tendência acertou o lado tanto quanto uma moeda ao ar. Ela serve para ler o placar, não para adivinhar o preço.',
    );
    expect(describeVerdict(COIN_FLIP_VERDICT.BELOW)).toBe(
      'Até aqui, a tendência errou o lado mais vezes que uma moeda ao ar.',
    );
    expect(describeVerdict(COIN_FLIP_VERDICT.TOO_FEW)).toBe(
      'Ainda há poucas previsões para dizer se acerta mais que o acaso.',
    );
  });
});
