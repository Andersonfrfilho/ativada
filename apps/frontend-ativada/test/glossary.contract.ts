// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { GLOSSARY, GLOSSARY_TERM } from '../src/glossary/glossary.constant.js';

const ENTRIES = Object.values(GLOSSARY);

describe('glossary', () => {
  test('has one entry for each term of the spec (RF13)', () => {
    const terms: string[] = Object.values(GLOSSARY_TERM);
    expect(terms.sort()).toEqual(Object.keys(GLOSSARY).sort());
    expect(ENTRIES.map((entry) => entry.label).sort()).toEqual(
      [
        'Fator de lucro',
        'Maior queda',
        'Slippage',
        'Sharpe',
        'Sortino',
        'Taxa de acerto',
        'Vela',
        'Pontuação do placar',
        'Limiar',
        'Comprar e segurar',
        'Stop',
        'Alvo',
      ].sort(),
    );
  });

  test('every phrase is one line of plain text that ends with a period', () => {
    for (const entry of ENTRIES) {
      expect(entry.phrase.trim()).toBe(entry.phrase);
      expect(entry.phrase).not.toMatch(/[\r\n]/);
      expect(entry.phrase.endsWith('.')).toBe(true);
      expect(entry.phrase.length).toBeGreaterThan(20);
      expect(entry.phrase.length).toBeLessThanOrEqual(120);
    }
  });

  test('no phrase and no label repeats', () => {
    expect(new Set(ENTRIES.map((entry) => entry.phrase)).size).toBe(ENTRIES.length);
    expect(new Set(ENTRIES.map((entry) => entry.label)).size).toBe(ENTRIES.length);
  });

  test('the phrases are the ones the spec fixed', () => {
    expect(GLOSSARY[GLOSSARY_TERM.SORTINO].phrase).toBe(
      'Igual ao Sharpe, mas só conta as quedas como risco.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.WIN_RATE].phrase).toBe(
      'De cada 100 operações, quantas terminaram no lucro.',
    );
  });

  test('the live tracking terms (spec 008, RF13) each have one fixed phrase', () => {
    expect(GLOSSARY[GLOSSARY_TERM.CANDLE].phrase).toBe(
      'Um trecho de tempo (1 hora, por exemplo) com o preço de abertura, o maior, o menor e o de fechamento.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.SCORE].phrase).toBe(
      'A soma dos votos das regras: cada uma vota a favor, contra ou fica neutra, e o peso dela conta.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.THRESHOLD].phrase).toBe(
      'A pontuação mínima que dispara a compra ou a venda; abaixo dela, a simulação espera.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.BUY_AND_HOLD].phrase).toBe(
      'O que você teria hoje se tivesse comprado no começo e nunca mais vendido, sem operar.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.STOP_PRICE].phrase).toBe(
      'O preço de proteção: se o preço cair até ele, a simulação vende para limitar a perda.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.TARGET_PRICE].phrase).toBe(
      'O preço de lucro: se o preço subir até ele, a simulação vende e garante o ganho.',
    );
  });
});
