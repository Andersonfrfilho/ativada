// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AuditorSummary, AuditorVerdict } from './auditor-oracle.fixture.js';

// Resultado do auditor `analyst-1` nos dois conjuntos reais do motor (gravado na T0.1 da spec 007), decisão na última vela,
// janela de 2.880 velas (cobre o conjunto inteiro) e de 96. Uma linha por caso, na ordem: previsões, sem leitura, sem
// lado, lacuna, acertos, erros, empates, subidas, acerto, "sempre sobe", veredito, limite inferior, superior e peso.
// Mudar a regra exige `analyst-2` e este dourado regravado; `accuracy-auditor.ts` (T1.2) tem de devolver os mesmos números.
// A linha `strategy` é o Placar clássico: com a janela inteira ela repete o dourado da `projection-1` (spec 009).
export const AUDITOR_GOLDEN: Readonly<Record<string, string>> = {
  'btcusdt-1h-500:trend:2880':
    '499 128 130 0 112 129 0 126 0.4647 0.5228 even 0.402807085795 0.527760268772 0',
  'btcusdt-1h-500:trend:96':
    '96 0 40 0 26 30 0 29 0.4642 0.5178 even 0.340196434035 0.592960433428 0',
  'btcusdt-1h-500:reversion:2880':
    '499 96 327 0 36 40 0 34 0.4736 0.4473 even 0.365419130118 0.584481673473 0',
  'btcusdt-1h-500:reversion:96':
    '96 0 85 0 5 6 0 5 0.4545 0.4545 too_few 0.212709575439 0.719912244311 0',
  'btcusdt-1h-500:volume:2880':
    '499 96 0 0 202 201 0 210 0.5012 0.521 even 0.452642875644 0.549815083424 0',
  'btcusdt-1h-500:volume:96': '96 0 0 0 48 48 0 53 0.5 0.552 even 0.40192229167 0.59807770833 0',
  'btcusdt-1h-500:sentiment:2880':
    '499 96 192 0 97 114 0 114 0.4597 0.5402 even 0.393789354039 0.527082581378 0',
  'btcusdt-1h-500:sentiment:96':
    '96 0 53 0 19 24 0 28 0.4418 0.6511 even 0.304330856239 0.588926419345 0',
  'btcusdt-1h-500:strategy:2880':
    '499 193 21 0 134 151 0 153 0.4701 0.5368 even 0.413010549938 0.528133661976 0',
  'btcusdt-1h-500:strategy:96':
    '96 0 0 0 47 49 0 53 0.4895 0.552 even 0.391926893948 0.588041375791 0',
  'ethusdt-1d-400:trend:2880':
    '399 128 77 0 86 108 0 106 0.4432 0.5463 even 0.375167217965 0.513632710867 0',
  'ethusdt-1d-400:trend:96':
    '96 0 25 0 29 42 0 40 0.4084 0.5633 even 0.301685520023 0.524614291846 0',
  'ethusdt-1d-400:reversion:2880':
    '399 96 262 0 24 17 0 23 0.5853 0.5609 even 0.433668353568 0.722436691747 0',
  'ethusdt-1d-400:reversion:96':
    '96 0 80 0 10 6 0 9 0.625 0.5625 too_few 0.386406470979 0.815190174453 0',
  'ethusdt-1d-400:volume:2880':
    '399 96 0 0 134 169 0 155 0.4422 0.5115 below 0.387391117527 0.498543514543 0',
  'ethusdt-1d-400:volume:96':
    '96 0 0 0 37 59 0 49 0.3854 0.5104 below 0.294256149565 0.485394817567 0',
  'ethusdt-1d-400:sentiment:2880':
    '399 96 147 0 72 84 0 78 0.4615 0.5 even 0.385172800771 0.539752875649 0',
  'ethusdt-1d-400:sentiment:96':
    '96 0 46 0 24 26 0 29 0.48 0.58 even 0.347969123955 0.614884877412 0',
  'ethusdt-1d-400:strategy:2880':
    '399 193 14 0 84 108 0 98 0.4375 0.5104 even 0.369236122249 0.508215859353 0',
  'ethusdt-1d-400:strategy:96':
    '96 0 3 0 36 57 0 47 0.387 0.5053 below 0.294458994149 0.488692048378 0',
};

const VERDICTS: readonly AuditorVerdict[] = ['above', 'even', 'below', 'too_few'];

function isVerdict(value: string | undefined): value is AuditorVerdict {
  return VERDICTS.some((verdict) => verdict === value);
}

function integerAt(fields: readonly string[], index: number): number {
  const value = Number(fields[index]);
  if (!Number.isSafeInteger(value)) throw new Error(`campo ${index} do dourado não é inteiro`);
  return value;
}

function nullableAt(fields: readonly string[], index: number): string | null {
  const value = textAt(fields, index);
  return value === 'null' ? null : value;
}

function textAt(fields: readonly string[], index: number): string {
  const value = fields[index];
  if (value === undefined) throw new Error(`campo ${index} ausente no dourado`);
  return value;
}

// Remonta o `AuditorSummary` de uma linha do dourado.
export function parseAuditorGolden(line: string): AuditorSummary {
  const fields = line.split(' ');
  const verdict = fields[10];
  if (fields.length !== 14 || !isVerdict(verdict)) throw new Error('linha do dourado malformada');
  const hits = integerAt(fields, 4);
  const misses = integerAt(fields, 5);
  return {
    predictions: integerAt(fields, 0),
    unread: integerAt(fields, 1),
    noSide: integerAt(fields, 2),
    gap: integerAt(fields, 3),
    hits,
    misses,
    ties: integerAt(fields, 6),
    upMoves: integerAt(fields, 7),
    counted: hits + misses,
    hitRate: nullableAt(fields, 8),
    upRate: nullableAt(fields, 9),
    verdict,
    lower: nullableAt(fields, 11),
    upper: nullableAt(fields, 12),
    weight: textAt(fields, 13),
  };
}
