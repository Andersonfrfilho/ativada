// Copyright (c) 2026 Ada Technology. All rights reserved.
const REALM_GLOB = 'realm/*.json';
const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;

export type RealmFile = {
  readonly name: string;
  readonly modifiedAt: number;
};

export type StalenessParams = {
  readonly volumeCreatedAt: number;
  readonly realmFiles: readonly RealmFile[];
};

export function findRealmFilesNewerThanVolume(params: StalenessParams): readonly string[] {
  return params.realmFiles
    .filter((file) => file.modifiedAt > params.volumeCreatedAt)
    .map((file) => file.name);
}

export function buildStalenessWarning(params: {
  readonly files: readonly string[];
  readonly environment: string;
}): string {
  return [
    `AVISO: ${params.files.join(', ')} é mais novo que o volume do Keycloak.`,
    'O --import-realm não altera um realm que já existe, então a mudança não está valendo.',
    `Para aplicar (apaga os dados do Keycloak deste ambiente): make down ENV=${params.environment} DOWN_FLAGS=--volumes && make up ENV=${params.environment}`,
  ].join('\n');
}

async function readVolumeCreatedAt(volumeName: string): Promise<number | undefined> {
  const inspection = Bun.spawn(
    ['docker', 'volume', 'inspect', volumeName, '--format', '{{.CreatedAt}}'],
    {
      stdout: 'pipe',
      stderr: 'ignore',
    },
  );
  const output = (await new Response(inspection.stdout).text()).trim();
  if ((await inspection.exited) !== 0) return undefined;
  const createdAt = Date.parse(output);
  return Number.isNaN(createdAt) ? undefined : createdAt;
}

async function listRealmFiles(): Promise<readonly RealmFile[]> {
  const files: RealmFile[] = [];
  for await (const name of new Bun.Glob(REALM_GLOB).scan({ cwd: REPOSITORY_ROOT })) {
    files.push({ name, modifiedAt: Bun.file(`${REPOSITORY_ROOT}${name}`).lastModified });
  }
  return files;
}

async function main(): Promise<void> {
  const environment = Bun.env['ENV'] ?? 'dev';
  const projectName = Bun.env['PROJECT_NAME'] ?? '';
  const volumeCreatedAt = await readVolumeCreatedAt(`${projectName}-${environment}-keycloak-data`);
  if (volumeCreatedAt === undefined) return;
  const stale = findRealmFilesNewerThanVolume({
    volumeCreatedAt,
    realmFiles: await listRealmFiles(),
  });
  if (stale.length > 0) console.error(buildStalenessWarning({ files: stale, environment }));
}

if (import.meta.main) {
  await main().catch(() => undefined);
}
