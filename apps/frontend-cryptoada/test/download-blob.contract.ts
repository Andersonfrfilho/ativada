// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { saveAndRevokeLater } from '../src/account/download-blob.js';

describe('saving a downloaded file', () => {
  test('revokes the object URL only after the browser had time to start the download', async () => {
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (): string => 'blob:test-url';
    URL.revokeObjectURL = (url: string): void => void revoked.push(url);
    try {
      saveAndRevokeLater({ blob: new Blob(['x']), fileName: 'dados.json' }, 20);
      expect(revoked).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(revoked).toEqual(['blob:test-url']);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
