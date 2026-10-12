// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { isDocumentationEnvironment } from '../apps/api-ativada/src/docs/documentation-environment.js';

describe('a documentação da API só liga em ENV=dev ou ENV=test, por lista explícita', () => {
  test.each(['dev', 'test'])('%s liga', (name) => {
    expect(isDocumentationEnvironment(name)).toBe(true);
  });

  test.each(['production', 'staging', 'preview', 'DEV', 'Test', ' dev', ''])(
    'qualquer outro valor (%p) desliga: um ambiente novo nasce sem /v1/docs',
    (name) => {
      expect(isDocumentationEnvironment(name)).toBe(false);
    },
  );
});
