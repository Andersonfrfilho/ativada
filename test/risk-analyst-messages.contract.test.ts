// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { AnalystDecision, SpecialistView } from '../packages/risk-analyst/src/index.js';
import {
  buildScenarioInput,
  CANDLE,
  closedPosition,
  openPosition,
  SCENARIO_TIME,
  type ScenarioOptions,
} from './fixtures/risk-analyst/decision-scenario.fixture.js';
import { loadRiskAnalystApi } from './fixtures/risk-analyst/risk-analyst-api.fixture.js';

const api = await loadRiskAnalystApi();
const {
  ANALYST_DISCLAIMER,
  buildAnalystMessages,
  buildCadenceLine,
  buildGoalProgressMessage,
  buildLockLines,
  buildOffCadenceMessage,
  buildPostureLine,
  buildReasonMessage,
  buildSpecialistRow,
  buildTimeExitMessage,
  decideAnalyst,
  FORBIDDEN_PHRASES,
  POSTURE_LABEL,
} = api;

// T1.3 da spec 007 (ADR 0002, A17): o catálogo FECHADO de frases, texto literal por chave, com os rótulos MODERADA e
// LIBERADA no lugar de NORMAL e CONFIANTE, e a varredura de palavras proibidas.

const T = SCENARIO_TIME;
const GOAL = { targetRate: '0.03', maxLossRate: '0.1', horizonDays: 7 };

function decide(options: ScenarioOptions = {}): AnalystDecision {
  return decideAnalyst(buildScenarioInput({ votes: { reversion: 1 }, ...options }));
}

function loss(closedAt: number): ReturnType<typeof closedPosition> {
  return closedPosition({
    openedCandleTime: closedAt - 2 * CANDLE,
    closedCandleTime: closedAt,
    netProfit: '-1',
  });
}

describe('rótulos e linha de postura', () => {
  test('os quatro rótulos: PAUSA, CAUTELA, MODERADA e LIBERADA (nunca "confiante")', () => {
    expect(POSTURE_LABEL).toStrictEqual({
      pause: 'PAUSA',
      caution: 'CAUTELA',
      normal: 'MODERADA',
      confident: 'LIBERADA',
    });
  });

  test('LIBERADA: o mesmo risco da estratégia (1,00% do saldo), olhando de hora em hora', () => {
    expect(buildPostureLine(decide(), '0.01')).toBe(
      'Postura agora: LIBERADA · olha o mercado a cada 1 hora · arrisca o mesmo do que a estratégia arriscaria (1,00% do saldo por operação) · cada operação dura no máximo 60 min.',
    );
  });

  test('MODERADA: metade (0,50%)', () => {
    expect(buildPostureLine(decide({ currentVolume: '9' }), '0.01')).toBe(
      'Postura agora: MODERADA · olha o mercado a cada 1 hora · arrisca ½ do que a estratégia arriscaria (0,50% do saldo por operação) · cada operação dura no máximo 60 min.',
    );
  });

  test('CAUTELA: um quarto (0,25%), a cada 15 min com volume alto e a cada 4 horas com volume baixo', () => {
    expect(buildPostureLine(decide({ winners: [], currentVolume: '15' }), '0.01')).toBe(
      'Postura agora: CAUTELA · olha o mercado a cada 15 min · arrisca ¼ do que a estratégia arriscaria (0,25% do saldo por operação) · cada operação dura no máximo 60 min.',
    );
    expect(buildPostureLine(decide({ winners: [], currentVolume: '5' }), '0.01')).toContain(
      'olha o mercado a cada 4 horas',
    );
  });

  test('o tamanho em % do saldo sobe na última casa (mostra o risco inteiro)', () => {
    expect(buildPostureLine(decide({ winners: [] }), '0.0133')).toContain(
      '(0,34% do saldo por operação)',
    );
  });

  test('PAUSA: nenhuma entrada nova, as saídas continuam valendo', () => {
    expect(buildPostureLine(decide({ votes: { reversion: -1 } }), '0.01')).toBe(
      'Postura agora: PAUSA · nenhuma entrada nova; as saídas da estratégia continuam valendo.',
    );
  });
});

describe('janela de entrada e ritmo', () => {
  test('fora da janela do ritmo de 1 hora e de 4 horas; dentro dela ou em pausa não há frase', () => {
    const offHour = decide({ start: 10_001 * CANDLE });
    expect(buildOffCadenceMessage(offHour)).toBe(
      'Fora da janela de entrada: com o ritmo de 1 hora, só a vela que fecha na hora cheia pode abrir operação.',
    );
    expect(buildOffCadenceMessage(decide({ currentVolume: '5' }))).toBe(
      'Fora da janela de entrada: com o ritmo de 4 horas, só a vela que fecha num múltiplo de 4 horas (UTC) pode abrir operação.',
    );
    expect(buildOffCadenceMessage(decide())).toBeNull();
    expect(
      buildOffCadenceMessage(decide({ votes: { reversion: -1 }, start: 10_001 * CANDLE })),
    ).toBeNull();
  });

  test('linha do ritmo: volume com 2 casas (para baixo) e o ritmo escolhido', () => {
    expect(buildCadenceLine(decide())).toBe(
      'Volume 1,00× o normal das últimas 24 horas: olha o mercado a cada 1 hora.',
    );
    expect(buildCadenceLine(decide({ currentVolume: '15.99' }))).toBe(
      'Volume 1,59× o normal das últimas 24 horas: olha o mercado a cada 15 min.',
    );
    expect(buildCadenceLine(decide({ length: 90 }))).toBeNull();
  });
});

describe('frases do motivo', () => {
  test('falta de dado, uma frase por detalhe', () => {
    const cases: readonly (readonly [ScenarioOptions, string])[] = [
      [{ isWaitingForData: true }, 'Faltam velas recentes: o analista espera os dados chegarem.'],
      [
        { isCatchingUp: true },
        'A simulação está atrasada em relação ao mercado: o analista não libera entrada até ela alcançar.',
      ],
      [
        { missingCandleIndexes: [250] },
        'Falta vela nas últimas 24 horas: sem a média de volume completa, o analista não libera entrada.',
      ],
      [
        { warmUpCandles: 250 },
        'O analista ainda está juntando histórico do par (pelo menos 24 horas de velas de 15 min).',
      ],
    ];
    for (const [options, text] of cases) expect(buildReasonMessage(decide(options))).toBe(text);
  });

  test('as cinco travas, com os números da decisão', () => {
    const streak = [loss(T - CANDLE), loss(T - 6 * CANDLE), loss(T - 10 * CANDLE)];
    const eight = Array.from({ length: 8 }, (_unused, index) =>
      openPosition(T - (index + 1) * CANDLE),
    );
    expect(buildReasonMessage(decide({ wallet: { equity: '990' } }))).toBe(
      'A perda das últimas 24 horas chegou a 1,00% do saldo inicial (o limite é 1%): pausa até a janela de 24 horas liberar.',
    );
    expect(buildReasonMessage(decide({ wallet: { positions: streak } }))).toBe(
      '3 operações seguidas terminaram em perda: pausa de 1 hora depois da última.',
    );
    expect(buildReasonMessage(decide({ wallet: { positions: eight } }))).toBe(
      'Já foram 8 operações nas últimas 24 horas (o teto é 8): pausa até a janela liberar.',
    );
    expect(
      buildReasonMessage(
        decide({ goal: GOAL, riskPerTrade: '0.05', wallet: { equity: '999.99' } }),
      ),
    ).toBe(
      'Falta pouco para a perda máxima da meta: cabem 9,99% do saldo, menos que o risco de 2 operações.',
    );
    expect(buildReasonMessage(decide({ currentAtr: '5' }))).toBe(
      'O movimento típico de 15 min (0,38%) não paga com folga a ida e volta das taxas (0,30%): precisa ser pelo menos o dobro.',
    );
  });

  test('mercado parado e equipe contra', () => {
    expect(buildReasonMessage(decide({ currentVolume: '3.9' }))).toBe(
      'Mercado parado: o volume está em 0,39× o normal das últimas 24 horas (abaixo de 0,4×).',
    );
    expect(buildReasonMessage(decide({ votes: { reversion: -1 } }))).toBe(
      'Os especialistas que provaram acertar apontam para baixo: o analista não deixa abrir operação contra eles.',
    );
  });

  test('sem previsão, uma frase por motivo', () => {
    expect(buildReasonMessage(decide({ currentAtr: '200' }))).toBe(
      'Mercado agitado demais para ler: a oscilação (15,40%) está acima de 95% das velas dos últimos 30 dias. Sem previsão.',
    );
    expect(buildReasonMessage(decide({ winners: [] }))).toBe(
      'Nenhum especialista acertou o lado mais vezes que uma moeda ao ar nos últimos 30 dias. Sem previsão.',
    );
    expect(buildReasonMessage(decide({ votes: { reversion: 0 } }))).toBe(
      'Os especialistas que provaram valor estão neutros nesta vela. Sem previsão.',
    );
    const split = decide({ winners: ['reversion', 'volume'], votes: { reversion: 1, volume: -1 } });
    expect(buildReasonMessage(split)).toBe(
      'Os especialistas que provaram valor se dividem: nenhum lado tem 2/3 do peso. Sem previsão.',
    );
  });

  test('tendência para cima: fraca, firme e firme com o tamanho cortado', () => {
    const weak = decide({ winners: ['reversion', 'volume'], votes: { reversion: 1, volume: 0 } });
    expect(buildReasonMessage(weak)).toBe(
      'Tendência para cima, fraca: menos de 2/3 do peso aprovado a favor.',
    );
    expect(buildReasonMessage(decide())).toBe(
      'Tendência para cima, firme, com volume normal ou acima e oscilação dentro do comum.',
    );
    expect(buildReasonMessage(decide({ currentVolume: '9' }))).toBe(
      'Tendência para cima, firme, mas com volume abaixo do normal: tamanho pela metade.',
    );
    expect(buildReasonMessage(decide({ currentAtr: '25.3' }))).toBe(
      'Tendência para cima, firme, mas com oscilação acima de 90% das velas dos últimos 30 dias: tamanho pela metade.',
    );
  });
});

describe('linhas das travas', () => {
  test('sem meta: a folga "não se aplica" e o resto mostra o estado', () => {
    expect(buildLockLines(decide())).toStrictEqual([
      'Perda das últimas 24 h: 0,00% de 1% permitido',
      'Perdas seguidas: 0 de 3',
      'Operações nas últimas 24 h: 0 de 8',
      'Folga até a perda máxima: sem meta, não se aplica',
      'Movimento ÷ custo: 5,13 (mínimo: 2)',
    ]);
  });

  test('com meta: a folga e o mínimo em %', () => {
    const lines = buildLockLines(decide({ goal: GOAL, wallet: { equity: '995' } }));
    expect(lines[0]).toBe('Perda das últimas 24 h: 0,50% de 1% permitido');
    expect(lines[3]).toBe('Folga até a perda máxima da meta: 9,54% (mínimo: 2,00%)');
  });

  test('sem leitura (aquecendo) o movimento ÷ custo sai com travessão', () => {
    expect(buildLockLines(decide({ warmUpCandles: 300 }))[4]).toBe(
      'Movimento ÷ custo: — (mínimo: 2)',
    );
  });
});

describe('saída por tempo, meta somada, modo e indisponível', () => {
  test('saída por tempo: manda sair; em sombra, mandaria', () => {
    expect(buildTimeExitMessage({ maxTradeMinutes: 60, isShadow: false })).toBe(
      'A operação aberta completou 60 min sem alvo nem stop: o analista manda sair na abertura da próxima vela.',
    );
    expect(buildTimeExitMessage({ maxTradeMinutes: 60, isShadow: true })).toBe(
      'A operação aberta completou 60 min sem alvo nem stop: o analista mandaria sair na abertura da próxima vela.',
    );
  });

  test('meta somada: o somado desce, o que falta sobe, singular e plural', () => {
    const params = {
      targetRate: '0.03',
      summedRate: '0.00649',
      remainingRate: '0.02351',
      trades: 5,
    };
    expect(buildGoalProgressMessage(params)).toBe(
      'Meta: +3,00% no prazo. Somado até aqui: +0,64% em 5 operações. Falta 2,36%.',
    );
    expect(buildGoalProgressMessage({ ...params, trades: 1 })).toContain('em 1 operação.');
    expect(buildGoalProgressMessage({ ...params, summedRate: '-0.0001', trades: 0 })).toContain(
      'Somado até aqui: −0,01% em 0 operações.',
    );
    expect(buildGoalProgressMessage({ ...params, summedRate: '0' })).toContain(
      'Somado até aqui: 0,00%',
    );
  });

  test('sem meta o resultado soma no saldo', () => {
    expect(buildGoalProgressMessage(null)).toBe(
      'Sem meta: o resultado das operações soma no saldo.',
    );
  });

  test('modo, falha, indisponível e aviso fixo', () => {
    expect(api.SHADOW_MODE_MESSAGE).toBe(
      'Modo sombra: o analista só observa e mostra o que faria; a simulação segue a estratégia sem mudança.',
    );
    expect(api.GOVERN_MODE_MESSAGE).toBe(
      'O analista está decidindo o ritmo e o tamanho desta simulação.',
    );
    expect(api.FAILURE_MESSAGE).toBe(
      'O analista não conseguiu decidir nesta vela; a simulação seguiu sem ele.',
    );
    expect(api.UNAVAILABLE_MESSAGE).toStrictEqual({
      not_running: 'A simulação não está rodando: o analista não decide.',
      stalled: 'A simulação parou de avançar; o analista volta quando ela voltar.',
      waiting_for_data:
        'A simulação espera velas que faltam; o analista volta quando elas chegarem.',
      no_candle: 'Aguardando a primeira vela de 15 min fechar.',
      warming_up: 'O analista ainda está juntando histórico do par.',
    });
    expect(ANALYST_DISCLAIMER).toBe(
      'O analista é uma regra automática sobre dados passados; não é recomendação. Tendência, não promessa. Tudo simulado, com dinheiro fictício.',
    );
  });
});

describe('tabela da equipe', () => {
  const base: SpecialistView = {
    key: 'trend',
    vote: 0,
    isUnread: false,
    predictions: 2400,
    counted: 2267,
    hits: 1204,
    misses: 1063,
    ties: 0,
    upMoves: 1100,
    hitRate: '0.5311',
    upRate: '0.4852',
    verdict: 'above',
    lower: '0.51',
    upper: '0.55',
    weight: '0.0373',
  };

  test('Tendência: neutro, "53,11% (1.204 de 2.267)", provou valor, peso 0,04', () => {
    expect(buildSpecialistRow(base)).toStrictEqual({
      label: 'Tendência',
      vote: 'neutro',
      accuracy: '53,11% (1.204 de 2.267)',
      situation: 'provou valor',
      weight: '0,04',
    });
  });

  test('rebaixado: igual à moeda e errou mais que a moeda; peso 0', () => {
    const even = buildSpecialistRow({
      ...base,
      key: 'reversion',
      vote: 1,
      verdict: 'even',
      weight: '0',
    });
    expect(even).toMatchObject({
      label: 'Reversão',
      vote: 'a favor',
      situation: 'rebaixado: igual à moeda',
      weight: '0',
    });
    const below = buildSpecialistRow({
      ...base,
      key: 'volume',
      vote: -1,
      verdict: 'below',
      weight: '0',
    });
    expect(below).toMatchObject({
      label: 'Volume',
      vote: 'contra',
      situation: 'rebaixado: errou mais que a moeda',
    });
  });

  test('em observação: sem taxa, só quantas foram contadas; sem leitura no lugar do voto', () => {
    const row = buildSpecialistRow({
      ...base,
      key: 'sentiment',
      vote: null,
      isUnread: true,
      counted: 27,
      hits: 14,
      hitRate: '0.5185',
      verdict: 'too_few',
      weight: '0',
    });
    expect(row).toStrictEqual({
      label: 'Sentimento',
      vote: 'sem leitura',
      accuracy: '— (27 contadas)',
      situation: 'em observação: menos de 30',
      weight: '0',
    });
  });

  test('a tendência da estratégia não vota; peso positivo minúsculo nunca aparece como zero', () => {
    expect(buildSpecialistRow({ ...base, key: 'strategy' })).toMatchObject({
      label: 'Tendência da estratégia',
      weight: 'não vota',
    });
    expect(buildSpecialistRow({ ...base, weight: '0.00198' }).weight).toBe('0,01');
  });
});

describe('o catálogo inteiro', () => {
  function collectStrings(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (typeof value !== 'object' || value === null) return [];
    return Object.values(value).flatMap(collectStrings);
  }

  const catalog = [
    api.POSTURE_LABEL,
    api.CADENCE_LABEL,
    api.RISK_FRACTION_LABEL,
    api.PAUSE_LINE,
    api.OFF_CADENCE_MESSAGE,
    api.NO_DATA_MESSAGE,
    api.TEAM_AGAINST_MESSAGE,
    api.NO_PROVEN_SPECIALIST_MESSAGE,
    api.PROVEN_NEUTRAL_MESSAGE,
    api.SPLIT_TEAM_MESSAGE,
    api.WEAK_FORECAST_MESSAGE,
    api.FIRM_FORECAST_MESSAGE,
    api.FIRM_CAPPED_LOW_VOLUME_MESSAGE,
    api.FIRM_CAPPED_HIGH_VOLATILITY_MESSAGE,
    api.NO_GOAL_MESSAGE,
    api.SHADOW_MODE_MESSAGE,
    api.GOVERN_MODE_MESSAGE,
    api.FAILURE_MESSAGE,
    api.UNAVAILABLE_MESSAGE,
    api.ANALYST_DISCLAIMER,
    api.SPECIALIST_LABEL,
    api.VOTE_LABEL,
    api.VERDICT_LABEL,
  ];

  const scenarios: readonly ScenarioOptions[] = [
    {},
    { currentVolume: '9' },
    { currentVolume: '15' },
    { currentVolume: '5' },
    { currentVolume: '3.9' },
    { winners: [] },
    { currentAtr: '200' },
    { currentAtr: '25.3' },
    { currentAtr: '5' },
    { votes: { reversion: -1 } },
    { votes: { reversion: 0 } },
    { winners: ['reversion', 'volume'], votes: { reversion: 1, volume: -1 } },
    { winners: ['reversion', 'volume'], votes: { reversion: 1, volume: 0 } },
    { isWaitingForData: true },
    { isCatchingUp: true },
    { missingCandleIndexes: [250] },
    { warmUpCandles: 250 },
    { wallet: { equity: '990' } },
    { goal: GOAL, riskPerTrade: '0.05', wallet: { equity: '999.99' } },
    { wallet: { positions: [openPosition(T - 3 * CANDLE)] } },
  ];

  test('nenhuma frase promete resultado: sem "vai subir", "garantido", "recomendamos", ordem de compra ou venda', () => {
    const generated = scenarios.flatMap((options) => {
      const decision = decide(options);
      const messages = buildAnalystMessages({ decision, riskPerTrade: '0.01', isShadow: true });
      return collectStrings(messages);
    });
    const texts = [...collectStrings(catalog), ...generated].map((text) => text.toLowerCase());
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(texts.filter((text) => text.includes(phrase))).toStrictEqual([]);
    }
    expect(texts.length).toBeGreaterThan(100);
  });

  test('toda decisão termina no aviso fixo e o rótulo antigo (NORMAL, CONFIANTE) não existe', () => {
    for (const options of scenarios) {
      const messages = buildAnalystMessages({
        decision: decide(options),
        riskPerTrade: '0.01',
        isShadow: false,
      });
      expect(messages.disclaimer).toBe(ANALYST_DISCLAIMER);
      expect(messages.disclaimer).toContain('não é recomendação');
      expect(messages.lockLines).toHaveLength(5);
      expect(messages.specialists).toHaveLength(5);
      expect(messages.postureLine).not.toMatch(/NORMAL|CONFIANTE/);
    }
  });

  test('a saída por tempo só aparece quando há saída a mandar', () => {
    const due = buildAnalystMessages({
      decision: decide({ wallet: { positions: [openPosition(T - 3 * CANDLE)] } }),
      riskPerTrade: '0.01',
      isShadow: true,
    });
    expect(due.timeExitMessage).toContain('mandaria sair');
    const none = buildAnalystMessages({ decision: decide(), riskPerTrade: '0.01', isShadow: true });
    expect(none.timeExitMessage).toBeNull();
  });
});
