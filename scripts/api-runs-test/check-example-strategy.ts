// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLASSIC_SCOREBOARD_STRATEGY,
  createStrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import { SUBJECT_EXAMPLE, SUBJECT_EXAMPLE_RACE, SYMBOL } from './api-runs-test.constant.js';
import { assertCondition, reportLine, type ApiRunsContext } from './api-runs-test-context.js';
import { dataOf, isFinished, waitForRun, type RunData } from './api-runs-helpers.js';
import type { SeriesWindow } from './check-backtest-flow.js';

const CONCURRENT_FIRST_ACCESSES = 20;
const STRATEGIES_PATH = '/v1/strategies?limit=100';

type ListedStrategy = { readonly id: string; readonly name: string; readonly isExample: boolean };
type ListedVersion = { readonly id: string; readonly version: number; readonly config: unknown };

async function checkFirstAccessListsTheExample(
  context: ApiRunsContext,
  window: SeriesWindow,
): Promise<void> {
  const listed = dataOf<ListedStrategy[]>(
    await context.call({ subject: SUBJECT_EXAMPLE, path: STRATEGIES_PATH }),
    200,
  );
  const [example] = listed;
  assertCondition(
    listed.length === 1 &&
      example?.isExample === true &&
      example.name === CLASSIC_SCOREBOARD_STRATEGY.name,
    `o primeiro GET /v1/strategies já lista o exemplo: ${JSON.stringify(listed)}`,
  );
  const versions = dataOf<ListedVersion[]>(
    await context.call({
      subject: SUBJECT_EXAMPLE,
      path: `/v1/strategies/${example?.id}/versions`,
    }),
    200,
  );
  assertCondition(
    versions.length === 1 &&
      createStrategyVersion(versions[0]?.config).configHash ===
        CLASSIC_SCOREBOARD_STRATEGY.version.configHash,
    'a versão 1 é a configuração do Placar clássico (mesmo hash)',
  );
  const run = dataOf<RunData>(
    await context.call({
      subject: SUBJECT_EXAMPLE,
      method: 'POST',
      path: '/v1/runs',
      body: {
        strategyVersionId: versions[0]?.id,
        kind: 'backtest',
        symbol: SYMBOL,
        timeframe: '1h',
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
      },
    }),
    202,
  );
  const finished = await waitForRun(context, {
    subject: SUBJECT_EXAMPLE,
    runId: run.id,
    until: isFinished,
    label: 'backtest da estratégia de exemplo',
  });
  assertCondition(finished.status === 'completed', `backtest do exemplo: ${finished.status}`);
  reportLine(
    'usuário novo: GET /v1/strategies já lista o Placar clássico (isExample) e um backtest com ele completa',
  );
}

async function checkSimultaneousFirstAccesses(context: ApiRunsContext): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: CONCURRENT_FIRST_ACCESSES }, () =>
      context.call({ subject: SUBJECT_EXAMPLE_RACE, path: STRATEGIES_PATH }),
    ),
  );
  for (const response of responses) assertCondition(response.status === 200, 'acesso simultâneo');
  const listed = dataOf<ListedStrategy[]>(
    await context.call({ subject: SUBJECT_EXAMPLE_RACE, path: STRATEGIES_PATH }),
    200,
  );
  const rows: unknown =
    await context.client`SELECT count(*)::int AS total FROM strategy_versions v JOIN strategies s ON s.id = v.strategy_id JOIN users u ON u.id = s.user_id WHERE u.keycloak_sub = ${SUBJECT_EXAMPLE_RACE}`;
  const versions = (rows as readonly { total: number }[])[0]?.total;
  assertCondition(
    listed.length === 1 && versions === 1,
    `${CONCURRENT_FIRST_ACCESSES} primeiros acessos simultâneos: ${listed.length} estratégia(s), ${String(versions)} versão(ões)`,
  );
  reportLine(
    `${CONCURRENT_FIRST_ACCESSES} primeiros acessos simultâneos pela API -> exatamente 1 estratégia de exemplo e 1 versão`,
  );
}

export async function checkExampleStrategy(
  context: ApiRunsContext,
  window: SeriesWindow,
): Promise<void> {
  await checkFirstAccessListsTheExample(context, window);
  await checkSimultaneousFirstAccesses(context);
}
