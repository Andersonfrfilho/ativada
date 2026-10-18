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
        'Vela em formação',
        'Volume',
        'Placar',
        'Tendência',
        'Faixa (ATR)',
        'Acerto do lado',
        'Moeda ao ar',
        'Equipe',
        'Especialista',
        'Auditor',
        'Analista de risco',
        'Postura',
        'Ritmo',
        'Intervalo de confiança',
        'Sem previsão',
        'Trava',
        'Modo sombra',
        'RSI',
        'Banda de Bollinger',
        'EMA (média)',
        'MACD',
        'Donchian',
        'OBV (volume)',
        'Medo e Ganância',
        'Proteção contra queda',
        'Líquido',
        'Ganho ÷ risco',
        'Faixa de compra',
        'Faixa de venda',
        'Faixa de proteção',
        'Agente de regra',
        'Agente de modelo',
        'Em observação',
        'Peso',
        'Equipe de modelo',
        'Papel',
        'Duelo',
        'Custo estimado',
        'Teto de custo',
        'Pedido avulso',
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

  test('the chart terms (spec 009, RF21) each have one fixed phrase', () => {
    expect(GLOSSARY[GLOSSARY_TERM.FORMING_CANDLE].phrase).toBe(
      'A vela de agora, que ainda não fechou: os valores mudam até o tempo dela acabar.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.VOLUME].phrase).toBe(
      'Quanto da moeda foi negociado durante a vela. Barra alta quer dizer muita negociação.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.SCOREBOARD].phrase).toBe(
      'A pontuação das regras em cada vela: acima de zero puxa para comprar, abaixo, para vender.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.TREND].phrase).toBe(
      'Para que lado o placar está inclinado agora. Não é promessa nem previsão do preço.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.ATR_BAND].phrase).toBe(
      'Quanto o preço costuma andar numa vela, pela média das últimas (ATR). Não é um limite.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.SIDE_HIT_RATE].phrase).toBe(
      'Em quantas previsões o preço fechou, na vela seguinte, do lado que a tendência apontava.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.COIN_FLIP].phrase).toBe(
      'A referência de 50%: o acerto esperado de quem escolhe o lado jogando uma moeda.',
    );
  });

  test('the analyst terms (spec 007, T3.2) each have one fixed phrase', () => {
    expect(GLOSSARY[GLOSSARY_TERM.ANALYST].phrase).toBe(
      'Uma regra automática que só tira risco: pausa as entradas e reduz o tamanho; nunca compra por conta própria.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.POSTURE].phrase).toBe(
      'O quanto o analista libera a simulação agora: pausa, cautela, moderada ou liberada.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.CADENCE].phrase).toBe(
      'De quanto em quanto tempo o analista aceita uma entrada nova: a cada 15 min, 1 hora ou 4 horas.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.CONFIDENCE_INTERVAL].phrase).toBe(
      'A faixa em que o acerto verdadeiro provavelmente está, com 95% de confiança; poucas previsões deixam a faixa larga.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.NO_FORECAST].phrase).toBe(
      'Quando os especialistas que provaram valor não apontam um lado, o analista não opina sobre a próxima vela.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.LOCK].phrase).toBe(
      'Um freio automático das entradas: perda do dia, perdas seguidas, excesso de operações, pouca folga ou taxas altas.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.SHADOW_MODE].phrase).toBe(
      'O analista só observa e mostra o que faria; a simulação segue a estratégia sem nenhuma mudança.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.SPECIALIST].phrase).toBe(
      'Uma família de indicadores (tendência, reversão, volume ou sentimento). Vota a favor, contra ou fica neutra.',
    );
    expect(GLOSSARY[GLOSSARY_TERM.AUDITOR].phrase).toBe(
      'Confere em quantas velas cada especialista acertou o lado e compara com a moeda ao ar (50%).',
    );
  });

  test('no analyst phrase promises profit, a price or an order', () => {
    const analystTerms = [
      GLOSSARY_TERM.ANALYST,
      GLOSSARY_TERM.POSTURE,
      GLOSSARY_TERM.CADENCE,
      GLOSSARY_TERM.CONFIDENCE_INTERVAL,
      GLOSSARY_TERM.NO_FORECAST,
      GLOSSARY_TERM.LOCK,
      GLOSSARY_TERM.SHADOW_MODE,
    ];
    for (const term of analystTerms) {
      expect(GLOSSARY[term].phrase).not.toMatch(
        /lucr|ganh|garant|certeza|vai (subir|cair)|recomend|compre|confiante/i,
      );
    }
  });

  test('no chart phrase promises profit or a price', () => {
    const chartTerms = [
      GLOSSARY_TERM.FORMING_CANDLE,
      GLOSSARY_TERM.VOLUME,
      GLOSSARY_TERM.SCOREBOARD,
      GLOSSARY_TERM.TREND,
      GLOSSARY_TERM.ATR_BAND,
      GLOSSARY_TERM.SIDE_HIT_RATE,
      GLOSSARY_TERM.COIN_FLIP,
    ];
    for (const term of chartTerms) {
      expect(GLOSSARY[term].phrase).not.toMatch(/lucr|ganh|garant|certeza|vai (subir|cair)/i);
    }
  });
});
