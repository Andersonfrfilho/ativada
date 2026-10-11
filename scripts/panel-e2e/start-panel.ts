// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  PANEL_PATH,
  STARTUP_POLL_MILLISECONDS,
  STARTUP_TIMEOUT_MILLISECONDS,
} from './panel-e2e.constant.js';

export type RunningPanel = {
  readonly stop: () => Promise<void>;
  readonly output: () => string;
};

async function runToCompletion(command: readonly string[]): Promise<void> {
  const child = Bun.spawn([...command], { stdout: 'pipe', stderr: 'pipe' });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0)
    throw new Error(`${command.join(' ')} falhou (${exitCode}): ${stdout}${stderr}`);
}

async function collect(stream: ReadableStream<Uint8Array>, chunks: string[]): Promise<void> {
  chunks.push(await new Response(stream).text());
}

async function waitUntilServing(url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok === true) return;
    await Bun.sleep(STARTUP_POLL_MILLISECONDS);
  }
  throw new Error(`o painel não respondeu em ${url}`);
}

// Constrói o painel de produção e o serve com `vite preview` (mesma origem e proxy em /v1, como no deploy).
export async function startPanel(baseUrl: string): Promise<RunningPanel> {
  await runToCompletion(['bun', 'run', '--cwd', PANEL_PATH, 'build']);
  const child = Bun.spawn(['bun', 'run', '--cwd', PANEL_PATH, 'preview'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const chunks: string[] = [];
  void collect(child.stdout, chunks);
  void collect(child.stderr, chunks);
  await waitUntilServing(baseUrl);
  return {
    output: (): string => chunks.join(''),
    stop: async (): Promise<void> => {
      child.kill();
      await child.exited;
    },
  };
}
