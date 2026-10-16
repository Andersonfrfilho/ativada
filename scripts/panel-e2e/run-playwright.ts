// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PLAYWRIGHT_BIN, PLAYWRIGHT_CONFIG } from './panel-e2e.constant.js';

// Devolve o código de saída do Playwright; o relatório vai direto ao terminal. PANEL_E2E_PLAYWRIGHT_BIN troca o binário e
// PANEL_E2E_GREP roda só os testes cujo título casa com a expressão (opt-in, para investigar um fluxo).
export async function runPlaywright(
  environment: Readonly<Record<string, string>>,
): Promise<number> {
  const grep = Bun.env['PANEL_E2E_GREP'];
  const child = Bun.spawn(
    [
      Bun.env['PANEL_E2E_PLAYWRIGHT_BIN'] ?? PLAYWRIGHT_BIN,
      'test',
      '-c',
      PLAYWRIGHT_CONFIG,
      ...(grep === undefined ? [] : ['--grep', grep]),
    ],
    {
      env: { ...Bun.env, ...environment },
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  return child.exited;
}
