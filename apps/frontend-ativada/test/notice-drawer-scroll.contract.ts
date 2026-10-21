// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

const css = readFileSync(new URL('../src/notices/Notices.module.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const match = css.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? '';
}

describe('a gaveta de avisos rola por dentro e não estoura a largura', () => {
  test('o diálogo é uma coluna do tamanho da tela e não passa dela', () => {
    const drawer = rule('.drawer');
    expect(drawer).toContain('flex-direction: column');
    expect(drawer).toMatch(/max-height: 100(d)?vh|inset: 0/);
    expect(drawer).toContain('overflow: hidden');
    expect(drawer).toContain('max-width: 100vw');
  });

  test('o corpo é o contêiner de rolagem (min-height 0 deixa o flex encolher)', () => {
    const body = rule('.body');
    expect(body).toContain('overflow-y: auto');
    expect(body).toContain('min-height: 0');
    expect(body).toContain('overflow-x: hidden');
  });

  test('o cabeçalho com o botão de fechar não rola junto', () => {
    expect(rule('.drawerHead')).toContain('flex-shrink: 0');
  });

  test('números longos quebram sem partir os dígitos do preço e o item não alarga a coluna', () => {
    expect(rule('.item')).toContain('min-width: 0');
    expect(css).toMatch(/overflow-wrap: anywhere/);
  });
});
