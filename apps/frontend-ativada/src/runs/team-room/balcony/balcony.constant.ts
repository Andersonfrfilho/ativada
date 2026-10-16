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
} as const;
