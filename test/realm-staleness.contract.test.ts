// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  buildStalenessWarning,
  findRealmFilesNewerThanVolume,
} from '../scripts/check-realm-staleness.js';

const VOLUME_CREATED_AT = Date.parse('2026-10-09T12:00:00.000Z');

describe('realm staleness (o import não altera um realm existente)', () => {
  test('flags the realm files modified after the volume was created', () => {
    const stale = findRealmFilesNewerThanVolume({
      volumeCreatedAt: VOLUME_CREATED_AT,
      realmFiles: [
        { name: 'old-realm.json', modifiedAt: VOLUME_CREATED_AT - 1 },
        { name: 'new-realm.json', modifiedAt: VOLUME_CREATED_AT + 1 },
      ],
    });
    expect(stale).toStrictEqual(['new-realm.json']);
  });

  test('a realm file written at the same instant is not newer', () => {
    expect(
      findRealmFilesNewerThanVolume({
        volumeCreatedAt: VOLUME_CREATED_AT,
        realmFiles: [{ name: 'same.json', modifiedAt: VOLUME_CREATED_AT }],
      }),
    ).toStrictEqual([]);
  });

  test('the warning names the file, the volume reset command and the environment', () => {
    const warning = buildStalenessWarning({ files: ['new-realm.json'], environment: 'dev' });
    expect(warning).toContain('new-realm.json');
    expect(warning).toContain('make down ENV=dev DOWN_FLAGS=--volumes');
  });
});
