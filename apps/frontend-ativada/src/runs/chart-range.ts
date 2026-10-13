// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DAY_MILLISECONDS = 86_400_000;

const DATE_FIELD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DIGITS_PATTERN = /^\d+$/;
const DATE_FIELD_LENGTH = 10;

// Faixa em milissegundos UTC, semiaberta: `from` entra e `to` não (o mesmo contrato do `/chart`).
export type ChartRange = {
  readonly from: number;
  readonly to: number;
};

export type RangeShortcut = {
  readonly key: 'all' | '30d' | '7d' | '1d';
  readonly label: string;
  readonly milliseconds: number | undefined;
};

// Durações em milissegundos, não dias de calendário local: a troca de horário de verão não as torna ambíguas.
export const RANGE_SHORTCUTS: readonly RangeShortcut[] = [
  { key: 'all', label: 'Tudo', milliseconds: undefined },
  { key: '30d', label: '30 dias', milliseconds: 30 * DAY_MILLISECONDS },
  { key: '7d', label: '7 dias', milliseconds: 7 * DAY_MILLISECONDS },
  { key: '1d', label: '1 dia', milliseconds: DAY_MILLISECONDS },
];

// "Tudo" sempre; o atalho mais longo que o período da execução some.
export function availableShortcuts(extent: ChartRange | undefined): readonly RangeShortcut[] {
  return RANGE_SHORTCUTS.filter(
    (shortcut) =>
      shortcut.milliseconds === undefined ||
      (extent !== undefined && shortcut.milliseconds <= extent.to - extent.from),
  );
}

// Os últimos N milissegundos do período; "Tudo" não é faixa (limpa a URL).
export function rangeForShortcut(
  extent: ChartRange,
  shortcut: RangeShortcut,
): ChartRange | undefined {
  if (shortcut.milliseconds === undefined) return undefined;
  return { from: Math.max(extent.from, extent.to - shortcut.milliseconds), to: extent.to };
}

export function isSameRange(left: ChartRange | undefined, right: ChartRange | undefined): boolean {
  return left?.from === right?.from && left?.to === right?.to;
}

// A faixa só vale dentro do período da execução (fora dele a API responde 400); sem sobra, não há faixa.
export function clampRange(range: ChartRange, extent: ChartRange): ChartRange | undefined {
  const from = Math.max(range.from, extent.from);
  const to = Math.min(range.to, extent.to);
  return to > from ? { from, to } : undefined;
}

export type ShiftParams = {
  readonly range: ChartRange;
  readonly extent: ChartRange;
  readonly direction: 1 | -1;
};

// Desloca pelo próprio tamanho e para na borda do período sem encolher a janela.
export function shiftRange(params: ShiftParams): ChartRange {
  const { range, extent, direction } = params;
  const width = range.to - range.from;
  const from = Math.min(
    Math.max(range.from + direction * width, extent.from),
    Math.max(extent.to - width, extent.from),
  );
  return { from, to: from + width };
}

export function canShift(params: ShiftParams): boolean {
  return !isSameRange(shiftRange(params), params.range);
}

// Na URL entra milissegundos ou ISO; qualquer outra coisa é ignorada, nunca vira `NaN`.
export function parseRangeParam(text: string | null): number | undefined {
  if (text === null || text === '') return undefined;
  const value = DIGITS_PATTERN.test(text) ? Number(text) : Date.parse(text);
  return Number.isSafeInteger(value) ? value : undefined;
}

export function formatRangeParam(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

// Campo de data: o dia em UTC ("2026-04-10"); o fuso do usuário só entra nos rótulos de hora.
export function toDateFieldValue(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, DATE_FIELD_LENGTH);
}

export function parseDateField(value: string): number | undefined {
  if (!DATE_FIELD_PATTERN.test(value)) return undefined;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
}

// "De" é o começo do dia escolhido; "Até" inclui o dia inteiro (o fim da faixa é o começo do dia seguinte).
export function applyDateField(
  range: ChartRange,
  edge: 'from' | 'to',
  value: string,
): ChartRange | undefined {
  const day = parseDateField(value);
  if (day === undefined) return undefined;
  const next =
    edge === 'from'
      ? { from: day, to: range.to }
      : { from: range.from, to: day + DAY_MILLISECONDS };
  return next.to > next.from ? next : undefined;
}
