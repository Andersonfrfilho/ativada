// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';
import { buildReport } from './fixtures/model-agents/team-report.fixture.js';

// T1.2b da spec 015 (RF08, RNF07): higiene do motivo e catálogo fechado das frases da tela.

const api = await loadModelAgentsApi();
const HIDDEN = {
  reason: 'O modelo deu um motivo fora das regras de linguagem da casa; o texto foi ocultado.',
  reasonHidden: true,
};
const SCREEN_BANNED = ['vai subir', 'garantido', 'recomendamos', 'confiante'];

describe('higiene do motivo (RF08)', () => {
  test('motivo limpo passa intacto', () => {
    expect(api.sanitizeReason('Três velas seguidas fecharam acima da EMA de 21.')).toStrictEqual({
      reason: 'Três velas seguidas fecharam acima da EMA de 21.',
      reasonHidden: false,
    });
  });

  test('as sete palavras proibidas', () => {
    expect([...api.FORBIDDEN_REASON_WORDS].sort()).toStrictEqual(
      ['certeza', 'compre', 'confiante', 'garantido', 'recomendamos', 'venda', 'vai subir'].sort(),
    );
  });

  test.each(['vai subir', 'garantido', 'recomendamos', 'compre', 'venda', 'confiante', 'certeza'])(
    'troca o texto que contém "%s"',
    (word) => {
      expect(api.sanitizeReason(`O preço ${word} logo`)).toStrictEqual(HIDDEN);
    },
  );

  test('não diferencia maiúscula', () => {
    expect(api.sanitizeReason('Estou CONFIANTE nisso')).toStrictEqual(HIDDEN);
    expect(api.sanitizeReason('Tenho Certeza')).toStrictEqual(HIDDEN);
  });

  test('caracteres invisíveis e de direção não escondem a palavra proibida', () => {
    expect(api.sanitizeReason('o preço é gar​antido')).toStrictEqual(HIDDEN);
    expect(api.sanitizeReason('com­pre agora')).toStrictEqual(HIDDEN);
    expect(api.sanitizeReason('‮compre')).toStrictEqual(HIDDEN);
    expect(api.sanitizeReason('ｃｏｍｐｒｅ')).toStrictEqual(HIDDEN);
  });

  test('quebras de linha viram espaço e controles somem', () => {
    const raw = 'linha um\nlinha\tdois\r\nlinha\u0000 três\u007f fim x';
    expect(api.sanitizeReason(raw)).toStrictEqual({
      reason: 'linha um linha dois linha três fim x',
      reasonHidden: false,
    });
  });

  test('a palavra proibida escondida atrás de uma quebra de linha ainda é achada', () => {
    expect(api.sanitizeReason('vai\nsubir')).toStrictEqual(HIDDEN);
    expect(api.sanitizeReason('com\u0000pre agora')).toStrictEqual(HIDDEN);
  });

  test('corta em 160 caracteres', () => {
    const result = api.sanitizeReason('a'.repeat(200));
    expect(result.reason).toBe('a'.repeat(160));
    expect(result.reasonHidden).toBe(false);
    expect(api.sanitizeReason('b'.repeat(160)).reason).toBe('b'.repeat(160));
  });

  test('o corte nunca deixa meio par substituto', () => {
    const raw = `${'a'.repeat(159)}😀😀`;
    const result = api.sanitizeReason(raw);
    expect(result.reason).toBe('a'.repeat(159));
  });

  test('palavra proibida depois do corte também esconde o texto todo', () => {
    const raw = `${'a'.repeat(170)} garantido`;
    expect(api.sanitizeReason(raw)).toStrictEqual(HIDDEN);
  });

  test('texto só de controle vira a frase fixa', () => {
    expect(api.sanitizeReason('\n\t\u0000 ')).toStrictEqual(HIDDEN);
  });
});

describe('higiene dos três textos do relatório (RF08)', () => {
  test('relatório limpo passa intacto, sem papel escondido', () => {
    const result = api.sanitizeReport(buildReport());
    expect(result.report).toStrictEqual(buildReport());
    expect(result.hiddenRoles).toStrictEqual([]);
  });

  test('cada papel é limpo e acusado separadamente', () => {
    const dirty = buildReport();
    const result = api.sanitizeReport({
      trend: { ...dirty.trend, reason: 'Sobe com certeza' },
      risk: { ...dirty.risk, reason: 'linha um\nlinha dois' },
      decision: { ...dirty.decision, reason: 'Compre agora' },
    });
    expect(result.hiddenRoles).toStrictEqual(['trend', 'decision']);
    expect(result.report.trend.reason).toBe(HIDDEN.reason);
    expect(result.report.risk.reason).toBe('linha um linha dois');
    expect(result.report.decision.reason).toBe(HIDDEN.reason);
  });

  test('só o texto muda: ação, preços, tendência, risco e confiança ficam como vieram', () => {
    const dirty = buildReport('buy');
    const result = api.sanitizeReport({
      ...dirty,
      decision: { ...dirty.decision, reason: 'garantido' },
    });
    expect(result.report.decision).toStrictEqual({ ...dirty.decision, reason: HIDDEN.reason });
    expect(result.report.trend.stance).toBe(dirty.trend.stance);
    expect(result.report.risk.level).toBe(dirty.risk.level);
  });
});

describe('catálogo fechado das frases da tela (RF19, RNF07)', () => {
  test('nenhuma frase tem linguagem de promessa ou conselho', () => {
    const banned = SCREEN_BANNED;
    const offending = api
      .listAllPhrases()
      .filter((phrase) => banned.some((word) => phrase.toLowerCase().includes(word)));
    expect(offending).toStrictEqual([]);
  });

  test('toda frase é de uma linha e sem HTML', () => {
    for (const phrase of api.listAllPhrases()) {
      expect(phrase.includes('\n')).toBe(false);
      expect(phrase.includes('<')).toBe(false);
      expect(phrase.trim()).toBe(phrase);
      expect(phrase.length).toBeGreaterThan(0);
    }
  });

  test('os selos da equipe: ícone e palavra do spec', () => {
    expect(api.TEAM_BADGE.buy).toStrictEqual({ icon: '↗', label: 'comprar' });
    expect(api.TEAM_BADGE.sell).toStrictEqual({ icon: '↘', label: 'vender' });
    expect(api.TEAM_BADGE.hold).toStrictEqual({ icon: '—', label: 'esperar' });
    expect(api.TEAM_BADGE.pending).toStrictEqual({ icon: '◷', label: 'pensando' });
    expect(api.TEAM_BADGE.disabled.label).toBe('desligada');
  });

  test('os seis estados do provedor, com ícone e palavra', () => {
    expect(api.describeProviderState('no_key', '')).toBe('⚠ sem chave configurada');
    expect(api.describeProviderState('budget_exhausted', '')).toBe('⏸ parada pelo teto de custo');
    expect(api.describeProviderState('circuit_open', '14:35')).toBe(
      '⚡ provedor fora (tentando de novo às 14:35)',
    );
    expect(api.describeProviderState('key_rejected', '')).toBe('⚠ chave recusada pelo provedor');
    expect(api.describeProviderState('model_not_found', '')).toBe(
      '⚠ modelo indisponível no provedor; confira o id no env',
    );
    expect(api.describeProviderState('ready', '')).toBe('● pronto');
    for (const badge of Object.values(api.PROVIDER_STATE_BADGE)) {
      expect(badge.icon.length).toBeGreaterThan(0);
      expect(badge.label.length).toBeGreaterThan(0);
    }
  });

  test('o rodapé de cada equipe cita a família do modelo', () => {
    expect(api.buildGeneratedByFooter('nina')).toBe('gerado por modelo: Gemini Pro · pode errar');
    expect(api.buildGeneratedByFooter('lucas')).toBe(
      'gerado por modelo: Claude Sonnet · pode errar',
    );
    expect(api.buildGeneratedByFooter('olivia')).toBe('gerado por modelo: GPT · pode errar');
  });

  test('as frases fixas do spec, literais', () => {
    expect(api.TEAM_NOTICE).toBe(
      'Equipe de modelo: um modelo de linguagem lê os mesmos dados públicos de mercado, com três papéis, e indica compra, venda ou espera. Pode errar; o auditor mede o acerto. Não é recomendação. Tudo simulado.',
    );
    expect(api.COST_ESTIMATE_NOTICE).toBe(
      'Estimativa pelos tokens e pelo preço configurado; a fatura do provedor é a palavra final.',
    );
    expect(api.COMPARISON_NOTICE).toBe(
      'Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação.',
    );
    expect(api.DUEL_NOTICE).toBe(
      'Mesmo par, mesma vela e mesmo saldo fictício. Período curto não prova nada.',
    );
    expect(api.ON_DEMAND_MARK).toBe('pedido avulso · não entra no placar');
    expect(api.HIDDEN_REASON_PHRASE).toBe(HIDDEN.reason);
  });

  test('os motivos gravados na linha de decisão (RF14)', () => {
    expect(api.NO_READING_REASON).toBe('equipe sem leitura');
    expect(api.IGNORED_ALREADY_LONG_REASON).toBe('ignorada: já comprada');
    expect(api.IGNORED_NO_POSITION_REASON).toBe('ignorada: sem posição');
  });
});
