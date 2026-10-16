// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamFamily } from '../team-room.constant.js';
import type { FigureRole } from '../TeamFigure.component.js';

export const BALCONY_SLOT = {
  TIAGO: 'tiago',
  RENATA: 'renata',
  ALICE: 'alice',
  VITOR: 'vitor',
  SOFIA: 'sofia',
  OTAVIO: 'otavio',
} as const;

export type BalconySlot = (typeof BALCONY_SLOT)[keyof typeof BALCONY_SLOT];

export type BalconyAgentDefinition = {
  readonly slot: BalconySlot;
  readonly name: string;
  readonly roleShort: string;
  readonly roleFull: string;
  readonly figureRole: FigureRole;
  // Os quatro especialistas são uma família de regras; Alice e Otávio não preveem a vela.
  readonly family: TeamFamily | undefined;
};

// A ordem da varanda: a Alice fica no centro (é ela quem decide) e o Otávio na ponta, ao lado da lousa.
export const BALCONY_AGENTS: readonly BalconyAgentDefinition[] = [
  {
    slot: BALCONY_SLOT.TIAGO,
    name: 'Tiago',
    roleShort: 'Tendência',
    roleFull: 'Especialista em Tendência',
    figureRole: 'trend',
    family: 'trend',
  },
  {
    slot: BALCONY_SLOT.RENATA,
    name: 'Renata',
    roleShort: 'Reversão',
    roleFull: 'Especialista em Reversão',
    figureRole: 'reversion',
    family: 'reversion',
  },
  {
    slot: BALCONY_SLOT.ALICE,
    name: 'Alice',
    roleShort: 'Risco sênior',
    roleFull: 'Analista de Risco sênior',
    figureRole: 'analyst',
    family: undefined,
  },
  {
    slot: BALCONY_SLOT.VITOR,
    name: 'Vitor',
    roleShort: 'Volume',
    roleFull: 'Especialista em Volume',
    figureRole: 'volume',
    family: 'volume',
  },
  {
    slot: BALCONY_SLOT.SOFIA,
    name: 'Sofia',
    roleShort: 'Sentimento',
    roleFull: 'Especialista em Sentimento',
    figureRole: 'sentiment',
    family: 'sentiment',
  },
  {
    slot: BALCONY_SLOT.OTAVIO,
    name: 'Otávio',
    roleShort: 'Auditor',
    roleFull: 'Auditor',
    figureRole: 'auditor',
    family: undefined,
  },
];

// Que ponto do gráfico cada agente comenta (Sofia e Otávio não têm linha).
export const LEADER_ANCHOR: Readonly<
  Record<string, 'band_lower' | 'ema_fast' | 'volume' | 'protection'>
> = {
  [BALCONY_SLOT.RENATA]: 'band_lower',
  [BALCONY_SLOT.TIAGO]: 'ema_fast',
  [BALCONY_SLOT.VITOR]: 'volume',
  [BALCONY_SLOT.ALICE]: 'protection',
};

export type BalconyModel = { readonly name: string; readonly role: string };

// Agentes de modelo que ainda não existem: aparecem marcados e apagados, sem voto nem fala.
export const BALCONY_MODELS: readonly BalconyModel[] = [
  { name: 'Nina', role: 'Notícias' },
  { name: 'Lucas', role: 'Estatístico' },
  { name: 'Clara', role: 'Repórter' },
];

export const BALCONY_TEXT = {
  KIND_RULE: 'Regra',
  KIND_RULE_MARK: '●',
  KIND_MODEL: 'Modelo',
  KIND_MODEL_MARK: '◆',
  DISCLAIMER: 'Simulação com dinheiro fictício · tendência, não promessa',
  NOT_VOTING: 'não vota',
  NO_MEASURE: 'Sem medida',
  NO_MEASURE_NOTE:
    'O auditor ainda não mede o acerto por especialista; o resumo geral está com o Otávio.',
  DECIDES: 'Decide',
  MEASURES: 'Mede',
  MEASURING: 'Medindo…',
  VALID_UNTIL: 'vale até',
  CLOSED_AT: 'vela das',
  BOARD_TITLE: 'Lousa da equipe',
  SHEET_TOGGLE: 'Lousa da equipe: proteções e ranking',
  CLOSE_SHEET: 'Fechar a ficha',
  LIST_SUMMARY: 'Equipe em texto',
  COMPACT: 'Compacto',
  COMFORTABLE: 'Confortável',
  EXPAND: 'Expandir equipe',
  MODEL_NOT_YET: 'Agente de modelo: ainda não existe. Não fala nem vota.',
  RANKING_FOOTER: 'Ranking é desempenho passado, não garantia.',
  RANKING_WINDOW: 'Janela: os últimos 30 dias, medidos pelo auditor do analista.',
  RANKING_UNMEASURED:
    'O servidor ainda não mede o acerto por especialista: sem número, sem posição.',
  RANKING_MODELS: 'Nina, Lucas e Clara: os agentes de modelo ainda não existem.',
  PAUSE: 'Pausar animação',
  RESUME: 'Continuar animação',
  NET_WORD: 'líquido',
  PROTECTION_TITLE: 'PROTEÇÃO CONTRA QUEDA',
  TARGET_TITLE: 'Alvo de ganho',
  BAND_NOTE: 'Faixas da estratégia nesta simulação, não recomendação.',
  NOT_AN_ORDER: 'É a regra da simulação, não uma ordem.',
  NO_POSITION: 'Sem operação aberta: a proteção contra queda aparece quando a simulação comprar.',
  PLAQUES_TITLE: 'Plaquinhas da operação',
  PLAQUES_NOTE:
    'Porcentagens já descontam taxa e deslizamento. Simulação com dinheiro fictício · tendência, não promessa.',
} as const;
