// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeBand,
  computeMoveRate,
  computeRate,
  isInsideBand,
  judgeMove,
  readSide,
  readSideThreshold,
  readStance,
  readStrength,
} from '../apps/api-ativada/src/runs/projections/projection-rule.js';
import {
  PROJECTION_RESULT,
  PROJECTION_SIDE,
  PROJECTION_STANCE,
  PROJECTION_STRENGTH,
} from '../apps/api-ativada/src/runs/projections/projections.constant.js';
import {
  isInsideBand as oracleIsInsideBand,
  rateOf,
  strengthOf,
} from './fixtures/projections/projection-summary-oracle.fixture.js';

const { BUY, SELL, NONE } = PROJECTION_SIDE;
const RANDOM_DRAWS = 2_000;

// Gerador determinístico (mulberry32): o mesmo sorteio em toda rodada.
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('regra projection-1 à mão (ADR 0002, spec 009, P3)', () => {
  test('o lado vem do sinal do placar', () => {
    expect(readSide('1')).toBe(BUY);
    expect(readSide('0.0001')).toBe(BUY);
    expect(readSide('-0.5')).toBe(SELL);
    expect(readSide('0')).toBe(NONE);
    expect(readSide('0.000')).toBe(NONE);
  });

  test('o limiar é o do lado: compra usa buy e venda usa sell', () => {
    const thresholds = { buy: '2', sell: '-1.5' };
    expect(readSideThreshold(BUY, thresholds)).toBe('2');
    expect(readSideThreshold(SELL, thresholds)).toBe('-1.5');
  });

  test('força na borda: metade do limiar ainda é fraca, logo acima é forte, no limiar decidiu', () => {
    const { WEAK, STRONG, DECIDED } = PROJECTION_STRENGTH;
    expect(readStrength({ score: '1', threshold: '2' })).toBe(WEAK);
    expect(readStrength({ score: '1.0000001', threshold: '2' })).toBe(STRONG);
    expect(readStrength({ score: '1.99', threshold: '2' })).toBe(STRONG);
    expect(readStrength({ score: '2', threshold: '2' })).toBe(DECIDED);
    expect(readStrength({ score: '3.5', threshold: '2' })).toBe(DECIDED);
    expect(readStrength({ score: '-0.75', threshold: '-1.5' })).toBe(WEAK);
    expect(readStrength({ score: '-1', threshold: '-1.5' })).toBe(STRONG);
    expect(readStrength({ score: '-1.5', threshold: '-1.5' })).toBe(DECIDED);
  });

  test('a postura combina o lado com estar comprada', () => {
    expect(readStance({ side: BUY, isHolding: false })).toBe(PROJECTION_STANCE.BUY);
    expect(readStance({ side: SELL, isHolding: false })).toBe(PROJECTION_STANCE.STAY_OUT);
    expect(readStance({ side: BUY, isHolding: true })).toBe(PROJECTION_STANCE.HOLD);
    expect(readStance({ side: SELL, isHolding: true })).toBe(PROJECTION_STANCE.SELL);
    expect(readStance({ side: NONE, isHolding: true })).toBeUndefined();
  });

  test('faixa na 9ª casa: a borda de baixo desce e a de cima sobe', () => {
    expect(computeBand({ close: '100', atr: '0.123456789' })).toStrictEqual({
      low: '99.87654321',
      high: '100.12345679',
    });
    expect(computeBand({ close: '100.5', atr: '0.5' })).toStrictEqual({ low: '100', high: '101' });
    expect(computeBand({ close: '100', atr: '0.000000001' })).toStrictEqual({
      low: '99.99999999',
      high: '100.00000001',
    });
    expect(computeBand({ close: '100', atr: null })).toBeNull();
  });

  test('o fechamento seguinte nas bordas da faixa está dentro; um passo além, fora', () => {
    const band = { low: '99.87654321', high: '100.12345679' };
    expect(isInsideBand({ band, nextClose: '99.87654321' })).toBe(true);
    expect(isInsideBand({ band, nextClose: '99.87654320' })).toBe(false);
    expect(isInsideBand({ band, nextClose: '100.12345679' })).toBe(true);
    expect(isInsideBand({ band, nextClose: '100.1234568' })).toBe(false);
  });

  test('acerto, erro, empate e sem lado', () => {
    const { HIT, MISS, TIE, NO_SIDE } = PROJECTION_RESULT;
    expect(judgeMove({ side: BUY, close: '100', nextClose: '100.00000001' })).toBe(HIT);
    expect(judgeMove({ side: BUY, close: '100', nextClose: '99.99999999' })).toBe(MISS);
    expect(judgeMove({ side: SELL, close: '100', nextClose: '99' })).toBe(HIT);
    expect(judgeMove({ side: SELL, close: '100', nextClose: '101' })).toBe(MISS);
    expect(judgeMove({ side: BUY, close: '100', nextClose: '100.0' })).toBe(TIE);
    expect(judgeMove({ side: SELL, close: '100', nextClose: '100' })).toBe(TIE);
    expect(judgeMove({ side: NONE, close: '100', nextClose: '110' })).toBe(NO_SIDE);
  });

  test('variação a 4 casas para BAIXO, inclusive a negativa', () => {
    expect(computeMoveRate({ close: '100', nextClose: '99.99' })).toBe('-0.0001');
    expect(computeMoveRate({ close: '100', nextClose: '101.2345' })).toBe('0.0123');
    expect(computeMoveRate({ close: '3', nextClose: '3.0001' })).toBe('0');
    expect(computeMoveRate({ close: '3', nextClose: '2.9999' })).toBe('-0.0001');
    expect(computeMoveRate({ close: '100', nextClose: '100' })).toBe('0');
  });

  test('taxa a 4 casas para baixo, sem denominador é nula', () => {
    expect(computeRate({ part: 171, total: 346 })).toBe('0.4942');
    expect(computeRate({ part: 2, total: 3 })).toBe('0.6666');
    expect(computeRate({ part: 3, total: 3 })).toBe('1');
    expect(computeRate({ part: 0, total: 5 })).toBe('0');
    expect(computeRate({ part: 1, total: 0 })).toBeNull();
  });
});

describe(`propriedades em ${RANDOM_DRAWS} sorteios`, () => {
  test('a faixa nunca encolhe e a decisão é igual à do oráculo', () => {
    const random = createRandom(9);
    for (let draw = 0; draw < RANDOM_DRAWS; draw += 1) {
      const close = (random() * 60_000 + 0.01).toFixed(8);
      const atr = (random() * 800).toFixed(1 + Math.floor(random() * 8));
      const nextClose = (Number(close) + (random() - 0.5) * 1_600).toFixed(8);
      const band = computeBand({ close, atr });
      if (band === null) throw new Error('faixa ausente com ATR');
      expect(Number(band.low)).toBeLessThanOrEqual(Number(close) - Number(atr) + 1e-6);
      expect(Number(band.high)).toBeGreaterThanOrEqual(Number(close) + Number(atr) - 1e-6);
      expect(isInsideBand({ band, nextClose })).toBe(oracleIsInsideBand({ close, atr, nextClose }));
    }
  });

  test('força e taxa iguais às do oráculo, e a taxa nunca passa da fração exata', () => {
    const random = createRandom(10);
    for (let draw = 0; draw < RANDOM_DRAWS; draw += 1) {
      const threshold = (1 + random() * 4).toFixed(2);
      const score = (random() * 6 + 0.01).toFixed(2);
      expect(readStrength({ score, threshold })).toBe(strengthOf({ score, threshold }));
      const total = 1 + Math.floor(random() * 500);
      const part = Math.floor(random() * (total + 1));
      const rate = computeRate({ part, total });
      expect(rate).toBe(rateOf(part, total));
      expect(Number(rate) * total).toBeLessThanOrEqual(part + 1e-9);
      expect(Number(rate)).toBeGreaterThan(part / total - 1e-4 - 1e-12);
    }
  });
});
