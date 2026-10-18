// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BALCONY_SLOT, type BalconySlot } from '../balcony/balcony.constant.js';

// A planta do escritório vivo como DADO PURO: uma grade de células, mesas de 2 × 1, o assento de cada pessoa na frente da
// mesa e os lugares onde se para (mesa da Alice, quadro de cotações, reunião). O desenho isométrico só lê estes números.
export type Cell = { readonly x: number; readonly y: number };

export const OFFICE_GRID = { columns: 14, rows: 10 } as const;

export type DeskSpec = {
  readonly slot: BalconySlot;
  // A célula da esquerda da mesa (ela ocupa esta e a da direita).
  readonly desk: Cell;
  // Onde a pessoa senta: na frente da mesa, de costas para o espectador.
  readonly seat: Cell;
  // Onde um colega para para falar com ela.
  readonly visit: Cell;
};

function deskOf(slot: BalconySlot, x: number, y: number): DeskSpec {
  return { slot, desk: { x, y }, seat: { x, y: y + 1 }, visit: { x: x + 2, y } };
}

// As seis mesas das regras (fileira de cima: os quatro especialistas; no meio: Alice e Otávio) e as três das equipes de modelo.
export const OFFICE_DESKS: readonly DeskSpec[] = [
  deskOf(BALCONY_SLOT.TIAGO, 2, 2),
  deskOf(BALCONY_SLOT.RENATA, 5, 2),
  deskOf(BALCONY_SLOT.VITOR, 8, 2),
  deskOf(BALCONY_SLOT.SOFIA, 11, 2),
  deskOf(BALCONY_SLOT.ALICE, 5, 5),
  deskOf(BALCONY_SLOT.OTAVIO, 8, 5),
  deskOf(BALCONY_SLOT.NINA, 2, 8),
  deskOf(BALCONY_SLOT.LUCAS, 5, 8),
  deskOf(BALCONY_SLOT.OLIVIA, 8, 8),
];

// Quem anda: as seis regras. As equipes de modelo indicam, não votam, e ficam sentadas no canto delas.
export const OFFICE_WALKERS: readonly BalconySlot[] = OFFICE_DESKS.slice(0, 6).map(
  (spec) => spec.slot,
);

export const OFFICE_PLANTS: readonly Cell[] = [
  { x: 0, y: 0 },
  { x: 13, y: 0 },
  { x: 0, y: 9 },
  { x: 13, y: 9 },
];

export const OFFICE_SPOT = {
  // Em frente ao quadro de cotações, na parede.
  BOARD: [
    { x: 7, y: 1 },
    { x: 8, y: 1 },
  ],
  // Ao lado da mesa da Alice: onde se entregam os papéis.
  ALICE: [
    { x: 7, y: 5 },
    { x: 4, y: 5 },
  ],
  // A reunião ao redor da mesa da Alice (cinco lugares: todos menos ela).
  MEETING: [
    { x: 4, y: 5 },
    { x: 7, y: 5 },
    { x: 5, y: 4 },
    { x: 6, y: 4 },
    { x: 4, y: 6 },
  ],
  // Reservado para a segunda fase: a lousa com os níveis (entrada, alvo, proteção) e a plaquinha de % líquido. Nenhuma rota
  // usa este lugar nesta fase.
  BOARD_EXTENSION: { x: 1, y: 5 },
} as const satisfies Record<string, Cell | readonly Cell[]>;

export function keyOf(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function isInside(cell: Cell): boolean {
  return cell.x >= 0 && cell.x < OFFICE_GRID.columns && cell.y >= 0 && cell.y < OFFICE_GRID.rows;
}

export function deskSpecOf(slot: BalconySlot): DeskSpec | undefined {
  return OFFICE_DESKS.find((spec) => spec.slot === slot);
}

// As duas células de cada mesa e as plantas: nunca se anda por cima.
export const FURNITURE: ReadonlySet<string> = new Set([
  ...OFFICE_DESKS.flatMap((spec) => [
    keyOf(spec.desk),
    keyOf({ x: spec.desk.x + 1, y: spec.desk.y }),
  ]),
  ...OFFICE_PLANTS.map(keyOf),
]);

// As células fechadas para quem anda: os móveis e o assento dos outros (o seu próprio assento é livre).
export function blockedFor(owner: BalconySlot): ReadonlySet<string> {
  const others = OFFICE_DESKS.filter((spec) => spec.slot !== owner).map((spec) => keyOf(spec.seat));
  return new Set([...FURNITURE, ...others]);
}
