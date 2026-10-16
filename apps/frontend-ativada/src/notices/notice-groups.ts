// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Notice } from './notice.validation.js';
import { describeDay, describeNoticePair } from './notice-text.js';

export type DayGroup = { readonly day: string; readonly notices: readonly Notice[] };
export type RunOption = { readonly runId: string; readonly label: string };

// Os avisos já vêm do mais novo para o mais antigo: o mesmo dia fica junto ("Hoje", "Ontem", a data).
export function groupByDay(params: {
  readonly notices: readonly Notice[];
  readonly now: number;
  readonly timeZone: string;
}): readonly DayGroup[] {
  const groups: { day: string; notices: Notice[] }[] = [];
  for (const notice of params.notices) {
    const day = describeDay({
      occurredAt: notice.occurredAt,
      now: params.now,
      timeZone: params.timeZone,
    });
    const last = groups[groups.length - 1];
    if (last?.day === day) last.notices.push(notice);
    else groups.push({ day, notices: [notice] });
  }
  return groups;
}

// O filtro "por simulação": só as simulações que têm aviso (o alerta de preço fica em "Todas").
export function listRunOptions(notices: readonly Notice[]): readonly RunOption[] {
  const seen = new Map<string, RunOption>();
  for (const notice of notices) {
    if (notice.runId !== null && !seen.has(notice.runId)) {
      seen.set(notice.runId, { runId: notice.runId, label: describeNoticePair(notice) });
    }
  }
  return [...seen.values()];
}
