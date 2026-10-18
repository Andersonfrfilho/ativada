// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createModelDuelRepository } from '../src/model-teams/model-duel.repository.js';
import { createModelTeamReadRepository } from '../src/model-teams/model-team-read.repository.js';
import { createTeamReportRepository } from '../src/model-teams/team-report.repository.js';
import { createUserModelTeamRepository } from '../src/model-teams/user-model-team.repository.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildEquityPoints,
  buildPositions,
  hashOf,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const SYSTEM_NAME = 'model-team-1';
const SYSTEM_CONFIG = { schemaVersion: 1, name: SYSTEM_NAME };
const SYSTEM_HASH = hashOf(JSON.stringify(SYSTEM_CONFIG));
const CANDLE_TIME = 1_700_000_100_000;

type CountRow = { readonly total: number };

// A `model-team-1` do usuário (migration 0028): marcada, uma só por dono, achada pelo hash e invisível à lista e ao teto.
async function checkSystemStrategy(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const strategies = createStrategyRepository(handle);
  const owner = await resolvePersistenceOwner(handle, 'subject-system-strategy-a');
  const other = await resolvePersistenceOwner(handle, 'subject-system-strategy-b');
  const ensure = (
    scope: typeof owner.scope,
  ): ReturnType<typeof strategies.ensureSystemStrategyVersion> =>
    strategies.ensureSystemStrategyVersion(scope, {
      name: SYSTEM_NAME,
      config: SYSTEM_CONFIG,
      configHash: SYSTEM_HASH,
    });
  const [first, second] = await Promise.all([ensure(owner.scope), ensure(owner.scope)]);
  assertCondition(first.id === second.id, 'duas chamadas juntas dão a MESMA versão do sistema');
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM strategies WHERE user_id = ${owner.userId}::uuid AND is_system`;
  assertCondition(
    (rows as readonly CountRow[])[0]?.total === 1,
    'uma estratégia do sistema por dono',
  );
  const mine = await ensure(owner.scope);
  const theirs = await ensure(other.scope);
  assertCondition(mine.id === first.id && theirs.id !== mine.id, 'cada dono tem a sua versão');
  const listed = await strategies.listStrategies(owner.scope);
  assertCondition(!listed.some((item) => item.id === first.strategyId), 'fora da lista');
  const page = await strategies.listStrategiesPage(owner.scope, { limit: 50, after: undefined });
  assertCondition(!page.strategies.some((item) => item.id === first.strategyId), 'fora da página');
  assertCondition(
    (await strategies.findStrategy(owner.scope, first.strategyId)) === undefined,
    'as rotas de estratégia não a acham (nem para editar nem para apagar)',
  );
  assertCondition(
    (await strategies.softDeleteStrategy(owner.scope, first.strategyId)) === false,
    'o dono não a apaga',
  );
  assertCondition(
    (await strategies.findVersion(owner.scope, first.id))?.id === first.id,
    'a execução a acha pela versão do dono',
  );
  assertCondition(
    (await strategies.findVersion(other.scope, first.id)) === undefined,
    'outro dono não acha a versão',
  );
  const quota = await strategies.createStrategyWithFirstVersion(owner.scope, {
    name: 'Teto sem a do sistema',
    isExample: false,
    config: { schemaVersion: 1, nonce: crypto.randomUUID() },
    configHash: hashOf(crypto.randomUUID()),
    maxStrategies: 1,
  });
  assertCondition(
    quota.strategy.name === 'Teto sem a do sistema',
    'a do sistema não conta no teto',
  );
  reportCheck(
    'estratégias: model-team-1 por dono, achada pelo hash, fora da lista, das rotas e do teto',
  );
}

// O contador de pedidos avulsos é do USUÁRIO no dia: a soma das equipes nunca passa do teto, nem com pedidos juntos.
async function checkOnDemandClaim(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const teams = createUserModelTeamRepository(handle);
  const owner = await resolvePersistenceOwner(handle, 'subject-on-demand-a');
  const other = await resolvePersistenceOwner(handle, 'subject-on-demand-b');
  for (const teamKey of ['nina', 'lucas']) {
    await teams.setEnabled(owner.scope, { teamKey, isEnabled: true });
    await teams.setEnabled(other.scope, { teamKey, isEnabled: true });
  }
  const claim = (scope: typeof owner.scope, teamKey: string): Promise<boolean> =>
    teams.claimOnDemand(scope, { teamKey, dailyLimit: 3 });
  const results = await Promise.all([
    claim(owner.scope, 'nina'),
    claim(owner.scope, 'lucas'),
    claim(owner.scope, 'nina'),
    claim(owner.scope, 'lucas'),
    claim(owner.scope, 'nina'),
  ]);
  assertCondition(
    results.filter(Boolean).length === 3,
    'cinco pedidos juntos: só 3 passam do teto de 3',
  );
  assertCondition(await claim(other.scope, 'nina'), 'o contador de outro usuário é só dele');
  assertCondition(
    !(await teams.claimOnDemand(owner.scope, { teamKey: 'nina', dailyLimit: 0 })),
    'teto 0 recusa',
  );
  assertCondition(
    !(await claim(owner.scope, 'olivia')),
    'equipe nunca ligada não tem linha para contar',
  );
  reportCheck('equipes: pedido avulso conta atômico por usuário e dia, somando as equipes');
}

// A leitura pública do par (placar, custo, falhas, recomendações) e o pedido avulso enfileirado.
async function checkReadAndOnDemand(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const reports = createTeamReportRepository(handle);
  const reads = createModelTeamReadRepository(handle);
  const opinionId = await reports.enqueueOnDemandReport({
    teamKey: 'lucas',
    provider: 'anthropic',
    symbol: 'OPINIONUSDT',
    candleTime: CANDLE_TIME,
  });
  const base = {
    exchange: 'binance',
    symbol: 'OPINIONUSDT',
    limitPerTeam: 3,
    scoreboardDays: 30,
    failureHours: 24,
  };
  const empty = await reads.readOverview({ ...base, onDemandIds: [] });
  assertCondition(
    empty.onDemand.length === 0 && empty.latest.length === 0,
    'sem id acompanhado, sem avulso',
  );
  const followed = await reads.readOverview({ ...base, onDemandIds: [opinionId] });
  assertCondition(
    followed.onDemand.length === 1 && followed.onDemand[0]?.status === 'pending',
    'o avulso pendente volta pelo id',
  );
  assertCondition(followed.latest.length === 0, 'pendente e avulso nunca entram nas recentes');
  const elsewhere = await reads.readOverview({
    ...base,
    symbol: 'OTHERUSDT',
    onDemandIds: [opinionId],
  });
  assertCondition(elsewhere.onDemand.length === 0, 'o id de outro par não vaza');
  const byCandle = await reads.listReportsForCandles({
    symbol: 'OPINIONUSDT',
    candleTimes: [CANDLE_TIME],
  });
  assertCondition(byCandle.length === 0, 'a comparação só traz relatórios agendados');
  reportCheck('equipes: leitura pública do par numa consulta e pedido avulso pendente');
}

// O duelo: só as execuções do dono, do grupo, e as curvas e operações presas ao dono.
async function checkDuelRepository(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const duels = createModelDuelRepository(handle);
  const owner = await resolvePersistenceOwner(handle, 'subject-duel-a');
  const other = await resolvePersistenceOwner(handle, 'subject-duel-b');
  const groupId = crypto.randomUUID();
  const run = await seedRun(handle, owner, {
    kind: RUN_KIND.LIVE_PAPER,
    timeframe: '15m',
    periodEnd: undefined,
    request: { signalSource: { kind: 'model_team', team: 'nina' }, duel: { groupId } },
  });
  const mine = await duels.listDuelRuns(owner.scope, groupId);
  assertCondition(mine.length === 1 && mine[0]?.id === run.id, 'o dono acha as execuções do grupo');
  assertCondition(
    (await duels.listDuelRuns(other.scope, groupId)).length === 0,
    'outro usuário não acha',
  );
  assertCondition(
    (await duels.listDuelRuns(owner.scope, crypto.randomUUID())).length === 0,
    'grupo inexistente é vazio',
  );
  await createRunBatchRepository(handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals: [],
      orders: [],
      fills: [],
      positions: buildPositions(2),
      equityPoints: buildEquityPoints(3),
      commands: [],
    }),
  );
  assertCondition(
    (await duels.readEquityCurves(owner.scope, [run.id])).length === 3,
    'o dono lê a curva da execução',
  );
  assertCondition(
    (await duels.countClosedTrades(owner.scope, [run.id]))[0]?.trades === 2,
    'o dono conta as operações fechadas',
  );
  assertCondition(
    (await duels.readEquityCurves(other.scope, [run.id])).length === 0,
    'curva presa ao dono',
  );
  const trades = await duels.countClosedTrades(other.scope, [run.id]);
  assertCondition(trades.length === 0, 'operações presas ao dono');
  reportCheck('duelo: execuções do grupo, curvas e operações presas ao dono');
}

export async function checkModelTeamApi(context: LifecycleCheckContext): Promise<void> {
  await checkSystemStrategy(context);
  await checkOnDemandClaim(context);
  await checkReadAndOnDemand(context);
  await checkDuelRepository(context);
}
