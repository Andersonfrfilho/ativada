// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createNoticeFeedRepository, type DatabaseHandle } from '@ativada/database';

import { createListNoticesUseCase, type ListNoticesUseCase } from './list-notices.use-case.js';

// A lista de avisos só lê: o repositório do banco e o relógio injetado (a janela de 30 dias parte dele).
export function createNoticeDependencies(params: {
  readonly database: DatabaseHandle;
  readonly now: () => number;
}): ListNoticesUseCase {
  return createListNoticesUseCase({
    notices: createNoticeFeedRepository(params.database),
    now: params.now,
  });
}
