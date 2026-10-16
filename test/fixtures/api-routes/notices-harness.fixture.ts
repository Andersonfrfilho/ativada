// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Route } from '../../../apps/api-ativada/src/router/route.types.js';
import { createInMemoryNotices, type InMemoryNotices } from './in-memory-notices.fixture.js';
import { createRunsHarness, type RunsHarness } from './runs-harness.fixture.js';

export type NoticesHarness = RunsHarness & { readonly notices: InMemoryNotices };

// O harness de execuções com a rota de avisos montada sobre o feed em memória.
export async function createNoticesHarness(): Promise<NoticesHarness> {
  const notices = createInMemoryNotices();
  const harness = await createRunsHarness({
    extraRoutes: (app, parts): readonly Route[] => [
      app.noticesRoute.createNoticesRoute(
        app.noticesUseCase.createListNoticesUseCase({
          notices: notices.repository,
          now: () => parts.clock.now,
        }),
      ),
    ],
  });
  return { ...harness, notices };
}
