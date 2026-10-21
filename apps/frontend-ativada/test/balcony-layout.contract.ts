// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

const stylesheet = readFileSync(
  new URL('../src/runs/team-room/balcony/Balcony.module.css', import.meta.url),
  'utf8',
);

function rulesFor(selector: string): readonly string[] {
  const bodies: string[] = [];
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  for (const match of stylesheet.matchAll(pattern)) bodies.push(match[1] ?? '');
  return bodies;
}

describe('a varanda nunca tampa o gráfico nem o rodapé', () => {
  test('the frame is not sticky or fixed anywhere', () => {
    const frames = rulesFor('.frame');
    expect(frames.length).toBeGreaterThan(0);
    for (const body of frames) expect(body).not.toMatch(/position:\s*(sticky|fixed)/);
  });

  test('the board on the phone stays in the flow, never fixed over the footer', () => {
    const boards = rulesFor('.board');
    expect(boards.length).toBeGreaterThan(1);
    for (const body of boards) expect(body).not.toMatch(/position:\s*(sticky|fixed)/);
  });
});
