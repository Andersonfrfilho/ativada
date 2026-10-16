// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GLOSSARY_TERM, type GlossaryTerm } from '../../../glossary/glossary.constant.js';
import type { IconName } from '../../../layout/Icon.component.js';
import { VOTE_LOOK } from '../team-room-view.js';
import type { FigureRole } from '../TeamFigure.component.js';
import type {
  AuditorView,
  RuleLine,
  SeatLook,
  SeatTone,
  SpecialistView,
  TeamRoomView,
} from '../team-room.types.js';
import { BALCONY_AGENTS, BALCONY_TEXT, type BalconySlot } from './balcony.constant.js';

export type BalconyAgent = {
  readonly slot: BalconySlot;
  readonly name: string;
  readonly roleShort: string;
  readonly roleFull: string;
  readonly figureRole: FigureRole;
  readonly tone: SeatTone;
  readonly seal: { readonly icon: IconName; readonly word: string };
  readonly vote: SeatLook | undefined;
  // O número que o agente olha, vindo da leitura gravada pelo servidor; sem leitura, a frase do servidor.
  readonly line: string | undefined;
  // O termo técnico da leitura (RSI, EMA...), para a dica no balão.
  readonly lineTerm: GlossaryTerm | undefined;
  readonly horizon: string | undefined;
  // A ficha: frases do servidor e fatos da tela, uma por linha.
  readonly facts: readonly string[];
  readonly ariaLabel: string;
};

export type BalconyInput = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly horizon: string | undefined;
};

const NOT_VOTING_LOOK: SeatLook = { tone: 'neutral', icon: 'pause', word: BALCONY_TEXT.NOT_VOTING };

const TERM_BY_KIND: Readonly<Record<string, GlossaryTerm>> = {
  rsi: GLOSSARY_TERM.RSI,
  bollinger: GLOSSARY_TERM.BOLLINGER,
  ema_cross: GLOSSARY_TERM.EMA,
  macd: GLOSSARY_TERM.MACD,
  donchian_breakout: GLOSSARY_TERM.DONCHIAN,
  obv_trend: GLOSSARY_TERM.OBV,
  fear_greed: GLOSSARY_TERM.FEAR_GREED,
};

function termOf(specialist: SpecialistView | undefined): GlossaryTerm | undefined {
  const rule = specialist?.rules.find((item) => ruleLineOf(item) !== undefined);
  return rule?.kind === undefined ? undefined : TERM_BY_KIND[rule.kind];
}

function ruleLineOf(rule: RuleLine): string | undefined {
  if (rule.reading !== undefined) return `${rule.label} ${rule.reading}`;
  return rule.motive;
}

function voteOf(specialist: SpecialistView): SeatLook {
  if (specialist.tone === 'quiet') return NOT_VOTING_LOOK;
  const counted = specialist.rules.filter((rule) => rule.isCounted);
  const hasFavor = counted.some((rule) => rule.voteKind === 'favor');
  const hasAgainst = counted.some((rule) => rule.voteKind === 'against');
  if (hasFavor && !hasAgainst) return VOTE_LOOK.favor;
  return hasAgainst && !hasFavor ? VOTE_LOOK.against : VOTE_LOOK.neutral;
}

function specialistFacts(specialist: SpecialistView): readonly string[] {
  const rules = specialist.rules.map((rule) => {
    const said = rule.motive ?? (rule.reading === undefined ? '' : `leitura ${rule.reading}`);
    return `${rule.label}: ${VOTE_LOOK[rule.voteKind].word}${said === '' ? '' : ` · ${said}`}`;
  });
  return [...rules, specialist.placard, BALCONY_TEXT.NO_MEASURE_NOTE];
}

function ariaOf(name: string, roleFull: string, sealWord: string): string {
  return `${name}, ${roleFull}, regra, ${sealWord}. Ver a ficha`;
}

function specialistAgent(
  definition: (typeof BALCONY_AGENTS)[number],
  specialist: SpecialistView | undefined,
  horizon: string | undefined,
): BalconyAgent {
  const seal = { icon: 'info', word: BALCONY_TEXT.NO_MEASURE } as const;
  const rules = specialist?.rules ?? [];
  return {
    ...definition,
    tone: specialist?.tone ?? 'quiet',
    seal,
    vote: specialist === undefined ? NOT_VOTING_LOOK : voteOf(specialist),
    line: rules.map(ruleLineOf).find((text) => text !== undefined),
    lineTerm: termOf(specialist),
    horizon,
    facts: specialist === undefined ? [BALCONY_TEXT.NO_MEASURE_NOTE] : specialistFacts(specialist),
    ariaLabel: ariaOf(definition.name, definition.roleFull, seal.word),
  };
}

function aliceAgent(
  definition: (typeof BALCONY_AGENTS)[number],
  { view, horizon }: BalconyInput,
): BalconyAgent {
  const { riskAnalyst, analyst } = view;
  const seal = { icon: 'flag', word: BALCONY_TEXT.DECIDES } as const;
  const lines = riskAnalyst?.lines ?? [analyst.message];
  return {
    ...definition,
    roleShort: riskAnalyst === undefined ? 'Resumo do placar' : definition.roleShort,
    tone: 'normal',
    seal,
    vote: riskAnalyst?.look ?? analyst.outcome,
    line: riskAnalyst === undefined ? `pontuação ${analyst.scoreText}` : lines[0],
    lineTerm: undefined,
    horizon,
    facts: lines,
    ariaLabel: ariaOf(definition.name, definition.roleFull, seal.word),
  };
}

function auditorAgent(
  definition: (typeof BALCONY_AGENTS)[number],
  auditor: AuditorView | undefined,
): BalconyAgent {
  const seal = { icon: 'search', word: BALCONY_TEXT.MEASURES } as const;
  return {
    ...definition,
    tone: 'normal',
    seal,
    vote: auditor?.look,
    line:
      auditor === undefined
        ? BALCONY_TEXT.MEASURING
        : `${auditor.rateText} · moeda ${auditor.coinText}`,
    lineTerm: undefined,
    horizon: undefined,
    facts: auditor === undefined ? [] : [auditor.lead, auditor.verdictMessage],
    ariaLabel: ariaOf(definition.name, definition.roleFull, seal.word),
  };
}

// Dos dados que a equipe já tem (nenhuma consulta nova) aos seis agentes da varanda, na ordem em que ficam em pé.
export function buildBalconyAgents(input: BalconyInput): readonly BalconyAgent[] {
  return BALCONY_AGENTS.map((definition) => {
    if (definition.family !== undefined) {
      const specialist = input.view.specialists.find((item) => item.family === definition.family);
      return specialistAgent(definition, specialist, input.horizon);
    }
    return definition.slot === 'alice'
      ? aliceAgent(definition, input)
      : auditorAgent(definition, input.auditor);
  });
}
