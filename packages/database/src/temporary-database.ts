// Copyright (c) 2026 Ada Technology. All rights reserved.
import { randomUUID } from 'node:crypto';

export type TemporaryDatabase = { readonly databaseName: string; readonly url: string };

export async function createTemporaryDatabase(
  adminUrl: string,
  namePrefix: string,
): Promise<TemporaryDatabase> {
  const databaseName = `${namePrefix}${randomUUID().replaceAll('-', '')}`;
  const admin = new Bun.SQL(adminUrl);
  try {
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.close();
  }
  const temporaryUrl = new URL(adminUrl);
  temporaryUrl.pathname = `/${databaseName}`;
  return { databaseName, url: temporaryUrl.toString() };
}

export async function dropTemporaryDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const admin = new Bun.SQL(adminUrl);
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.close();
  }
}
