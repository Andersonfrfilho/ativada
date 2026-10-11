// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PLAYWRIGHT_BIN, PLAYWRIGHT_CONFIG } from './panel-e2e.constant.js';

// Devolve o código de saída do Playwright; o relatório vai direto ao terminal.
export async function runPlaywright(
  environment: Readonly<Record<string, string>>,
): Promise<number> {
  const child = Bun.spawn([PLAYWRIGHT_BIN, 'test', '-c', PLAYWRIGHT_CONFIG], {
    env: { ...Bun.env, ...environment },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return child.exited;
}
