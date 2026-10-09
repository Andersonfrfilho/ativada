// Copyright (c) 2026 Ada Technology. All rights reserved.
const REPOSITORY_ROOT: string = new URL('../../', import.meta.url).pathname;

export async function readEnvironmentFile(fileName: string): Promise<Record<string, string>> {
  const content = await Bun.file(`${REPOSITORY_ROOT}envs/${fileName}`).text();
  const entries: [string, string][] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    entries.push([line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]);
  }
  return Object.fromEntries(entries);
}
