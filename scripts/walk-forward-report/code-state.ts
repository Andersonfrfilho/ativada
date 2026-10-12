// Copyright (c) 2026 Ada Technology. All rights reserved.
export type CodeState = { readonly commit: string; readonly isTreeClean: boolean };

// A árvore de CÓDIGO (não os documentos gerados) é o que precisa estar limpa para o hash do commit valer.
const CODE_PATHS = ['apps', 'packages', 'scripts', 'envs'];

async function runGit(args: readonly string[]): Promise<string> {
  const process = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const output = await new Response(process.stdout).text();
  if ((await process.exited) !== 0) throw new Error(`git ${args.join(' ')} falhou.`);
  return output.trim();
}

export async function readCodeState(): Promise<CodeState> {
  const commit = await runGit(['rev-parse', 'HEAD']);
  const dirty = await runGit(['status', '--porcelain', '--', ...CODE_PATHS]);
  return { commit, isTreeClean: dirty === '' };
}
