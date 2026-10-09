// Copyright (c) 2026 Ada Technology. All rights reserved.
import { join } from 'node:path';
import { ROLLBACK_SUFFIX } from './database.constant.js';

function readMigrationPrefix(fileName: string): number {
  return Number(fileName.split('_', 1)[0]);
}

export async function listRollbackFiles(migrationsFolder: string): Promise<string[]> {
  const glob = new Bun.Glob(`*${ROLLBACK_SUFFIX}`);
  const fileNames: string[] = [];
  for await (const fileName of glob.scan({ cwd: migrationsFolder })) {
    fileNames.push(fileName);
  }
  return fileNames.sort(
    (first, second) => readMigrationPrefix(second) - readMigrationPrefix(first),
  );
}

export async function applyRollbacks(options: {
  readonly databaseUrl: string;
  readonly migrationsFolder: string;
}): Promise<void> {
  const client = new Bun.SQL(options.databaseUrl);
  try {
    for (const fileName of await listRollbackFiles(options.migrationsFolder)) {
      const script = await Bun.file(join(options.migrationsFolder, fileName)).text();
      await client.begin(async (transaction) => {
        await transaction.unsafe(script);
      });
    }
  } finally {
    await client.close();
  }
}
