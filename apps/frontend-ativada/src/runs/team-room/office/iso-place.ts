// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Cell } from './office-grid.js';
import place from './IsoPlace.module.css';

// As classes que põem um elemento numa célula da planta: nada de `style=` (posição por variável CSS, vinda das classes).
export function placeClass(cell: Cell): string {
  return [place.cell, place[`x${cell.x}`], place[`y${cell.y}`]]
    .filter((name) => name !== undefined)
    .join(' ');
}
