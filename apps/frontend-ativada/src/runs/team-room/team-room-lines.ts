// Copyright (c) 2026 Ada Technology. All rights reserved.
import { VOTE_LOOK } from './team-room-view.js';
import type { AuditorView, RuleLine, SpecialistView, TeamRoomView } from './team-room.types.js';

function describeRule(rule: RuleLine): string {
  const vote = VOTE_LOOK[rule.voteKind].word;
  const parts = [`${rule.label}: ${vote}`, rule.motive, rule.reading && `leitura ${rule.reading}`];
  return parts.filter((part) => part !== undefined && part !== '').join(' · ');
}

// Uma linha por personagem, com o mesmo conteúdo do balão e da plaquinha: é o equivalente em texto do palco.
export function describeSpecialist(specialist: SpecialistView): string {
  const rules = specialist.rules.map(describeRule).join('; ');
  return `${specialist.name} — ${rules}. Placar: ${specialist.placard}.`;
}

export function describeAnalyst(view: TeamRoomView): string {
  const { analyst, riskAnalyst } = view;
  if (riskAnalyst !== undefined) {
    return `${riskAnalyst.name} — ${riskAnalyst.look.word}. ${riskAnalyst.lines.join(' ')}`;
  }
  return `${analyst.name} — ${analyst.outcome.word}, pontuação ${analyst.scoreText}. ${analyst.message}`;
}

export function describeAuditor(auditor: AuditorView): string {
  const parts = [
    `${auditor.look.word}. Acertou o lado ${auditor.rateText}; a moeda ao ar acerta ${auditor.coinText}.`,
    auditor.verdictMessage,
    auditor.intervalText,
  ];
  return `Auditor — ${parts.filter((part) => part !== undefined).join(' ')}`;
}

function votersOf(specialist: SpecialistView): string | undefined {
  const voted = specialist.rules.filter(
    (rule) => rule.isCounted && (rule.voteKind === 'favor' || rule.voteKind === 'against'),
  );
  if (voted.length === 0) return undefined;
  const votes = voted.map((rule) => `${rule.label} ${VOTE_LOOK[rule.voteKind].word}`);
  return `${specialist.name}: ${votes.join(', ')}`;
}

// O anúncio do leitor de tela: uma frase por vela nova, nunca uma por balão.
export function describeAnnouncement(view: TeamRoomView, closedText: string): string {
  const voters = view.specialists.flatMap((specialist) => votersOf(specialist) ?? []);
  const who = voters.length === 0 ? 'Nenhum especialista votou.' : `${voters.join('. ')}.`;
  const closing =
    view.riskAnalyst === undefined
      ? `Resumo do placar: ${view.analyst.outcome.word}.`
      : `Analista de risco: ${view.riskAnalyst.look.word}.`;
  return `Vela que fechou ${closedText}. ${who} ${closing} As falas estão na lista de texto.`;
}
