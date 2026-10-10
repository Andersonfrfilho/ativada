// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readPostgresErrorCode } from '../src/postgres-error-code.js';
import {
  COMMAND_STATUS,
  EXIT_REASON,
  ORDER_STATUS,
  POSITION_STATUS,
} from '../src/run-results/run-result.constant.js';
import { createRunResultRepository } from '../src/run-results/run-result.repository.js';
import type { OrderInput, PositionInput } from '../src/run-results/run-result.types.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import {
  buildCommands,
  buildOrders,
  buildPositions,
  captureErrorCode,
  resolvePersistenceOwner,
  seedRun,
} from './persistence-seed.js';

const FOREIGN_KEY_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';

type OrderRow = {
  readonly status: string;
  readonly price: string | null;
  readonly limit_price: string | null;
  readonly risk_amount: string | null;
};
type PositionRow = {
  readonly status: string;
  readonly exit_price: string | null;
  readonly exit_reason: string | null;
};

function orderEvent(status: OrderInput['status'], overrides: Partial<OrderInput>): OrderInput {
  const [base] = buildOrders(1);
  if (base === undefined) throw new Error('ordem base ausente');
  return { ...base, engineKey: 'mono-1', status, ...overrides };
}

async function readOrder(
  client: Bun.SQL,
  runId: string,
  key: string,
): Promise<OrderRow | undefined> {
  const rows: unknown =
    await client`SELECT status, price::text AS price, limit_price::text AS limit_price, risk_amount::text AS risk_amount FROM orders WHERE run_id = ${runId} AND engine_key = ${key}`;
  return (rows as readonly OrderRow[])[0];
}

export async function checkOrderMonotonicity(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-mono-owner');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  const created = orderEvent(ORDER_STATUS.CREATED, {
    price: undefined,
    quantity: undefined,
    limitPrice: '100',
    riskAmount: '5',
  });
  const filled = orderEvent(ORDER_STATUS.FILLED, {
    price: '101',
    quantity: '0.5',
    limitPrice: undefined,
    riskAmount: undefined,
  });
  assertCondition(
    (await results.appendOrders(owner.scope, run.id, [created]))?.written === 1,
    'created',
  );
  assertCondition(
    (await results.appendOrders(owner.scope, run.id, [filled]))?.written === 1,
    'created -> filled avança',
  );
  const advanced = await readOrder(client, run.id, 'mono-1');
  assertCondition(
    advanced?.status === 'filled' &&
      advanced.price === '101' &&
      advanced.limit_price === '100' &&
      advanced.risk_amount === '5',
    `o preenchimento completa a ordem sem apagar o que o evento anterior trouxe: ${JSON.stringify(advanced)}`,
  );
  const stale = await results.appendOrders(owner.scope, run.id, [created]);
  assertCondition(stale?.written === 0, 'status anterior não regride uma ordem final');
  const cancelled = await results.appendOrders(owner.scope, run.id, [
    orderEvent(ORDER_STATUS.CANCELLED, {}),
  ]);
  assertCondition(cancelled?.written === 0, 'um estado final não vira outro estado final');
  assertCondition(
    (await readOrder(client, run.id, 'mono-1'))?.status === 'filled',
    'continua filled',
  );
  const sameBatch = await results.appendOrders(owner.scope, run.id, [
    orderEvent(ORDER_STATUS.FILLED, { engineKey: 'mono-2', price: '7' }),
    orderEvent(ORDER_STATUS.CREATED, { engineKey: 'mono-2', limitPrice: '6' }),
  ]);
  const merged = await readOrder(client, run.id, 'mono-2');
  assertCondition(
    sameBatch?.written === 1 && merged?.status === 'filled' && merged.limit_price === '6',
    'created e filled no mesmo lote convergem para filled',
  );
  await results.appendOrders(owner.scope, run.id, [
    orderEvent(ORDER_STATUS.EXPIRED, { engineKey: 'mono-3' }),
  ]);
  await results.appendOrders(owner.scope, run.id, [
    orderEvent(ORDER_STATUS.FILLED, { engineKey: 'mono-3' }),
  ]);
  assertCondition(
    (await readOrder(client, run.id, 'mono-3'))?.status === 'expired',
    'expired não vira filled',
  );
  reportCheck(
    'orders: upsert de status monotônico; reenvio anterior e final→final não alteram; mesmo lote converge',
  );
}

function positionEvent(status: PositionInput['status']): PositionInput {
  const [base] = buildPositions(1);
  if (base === undefined) throw new Error('posição base ausente');
  const open = { ...base, status, engineKey: 'mono-position' };
  return status === POSITION_STATUS.OPEN
    ? {
        ...open,
        exitPrice: undefined,
        exitFee: undefined,
        netProfit: undefined,
        exitReason: undefined,
        closedCandleTime: undefined,
      }
    : open;
}

export async function checkPositionMonotonicity(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-mono-owner');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  const read = async (): Promise<PositionRow | undefined> => {
    const rows: unknown =
      await client`SELECT status, exit_price::text AS exit_price, exit_reason FROM positions WHERE run_id = ${run.id}`;
    return (rows as readonly PositionRow[])[0];
  };
  await results.appendPositions(owner.scope, run.id, [positionEvent(POSITION_STATUS.OPEN)]);
  const closing = await results.appendPositions(owner.scope, run.id, [
    positionEvent(POSITION_STATUS.CLOSED),
  ]);
  assertCondition(
    closing?.written === 1 && (await read())?.status === 'closed',
    'open -> closed avança',
  );
  const reopened = await results.appendPositions(owner.scope, run.id, [
    positionEvent(POSITION_STATUS.OPEN),
  ]);
  const row = await read();
  assertCondition(
    reopened?.written === 0 &&
      row?.status === 'closed' &&
      row.exit_price === '30500.00000000' &&
      row.exit_reason === EXIT_REASON.TARGET,
    'posição fechada não reabre nem perde a saída',
  );
  const sameBatch = await results.appendPositions(owner.scope, run.id, [
    { ...positionEvent(POSITION_STATUS.CLOSED), engineKey: 'mono-position-2' },
    { ...positionEvent(POSITION_STATUS.OPEN), engineKey: 'mono-position-2' },
  ]);
  assertCondition(
    sameBatch?.written === 1,
    'aberta e fechada no mesmo lote convergem para a fechada',
  );
  const incomplete = await captureErrorCode(
    client`INSERT INTO positions (id, user_id, run_id, engine_key, status, entry_price, quantity, stop_price, target_price, entry_fee, opened_candle_time) VALUES (${Bun.randomUUIDv7()}, ${owner.userId}, ${run.id}, 'closed-without-exit', 'closed', 1, 1, 1, 1, 0, 1)`,
  );
  assertCondition(
    incomplete === CHECK_VIOLATION,
    `posição fechada sem saída -> ${String(incomplete)}`,
  );
  reportCheck(
    'positions: upsert open -> closed monotônico; fechada não reabre nem nasce sem saída',
  );
}

export async function checkWindowNamespace(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-mono-owner');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  const windows = ['', 'w0:', 'w1:', 'w10:'];
  for (const prefix of windows) {
    const orders = buildOrders(2, prefix).map((order) => ({
      ...order,
      status: ORDER_STATUS.CREATED,
    }));
    assertCondition(
      (await results.appendOrders(owner.scope, run.id, orders))?.written === 2,
      `ordens ${prefix}`,
    );
  }
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM orders WHERE run_id = ${run.id}`;
  assertCondition(
    (rows as readonly { total: number }[])[0]?.total === 8,
    'janelas do walk-forward não colidem',
  );
  const commands = buildCommands(2).map((command, index) => ({
    ...command,
    commandId: `w${index}:command`,
  }));
  assertCondition(
    (await results.appendCommands(owner.scope, run.id, commands))?.written === 2,
    'comandos',
  );
  reportCheck(
    'walk-forward: engine_key com prefixo w<i>: não colide entre janelas nem com a execução simples',
  );
}

export async function checkCommandsAndForeignKey(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-mono-owner');
  const other = await resolvePersistenceOwner(handle, 'subject-mono-other');
  const results = createRunResultRepository(handle);
  const run = await seedRun(handle, owner);
  await results.appendCommands(owner.scope, run.id, buildCommands(3));
  const repeated = buildCommands(1).map((command) => ({
    ...command,
    status: COMMAND_STATUS.IGNORED_DUPLICATE,
  }));
  const duplicate = await results.appendCommands(owner.scope, run.id, repeated);
  const rows: unknown =
    await client`SELECT status FROM run_commands WHERE run_id = ${run.id} AND command_id = 'command-0'`;
  assertCondition(
    duplicate?.written === 0 && (rows as readonly { status: string }[])[0]?.status === 'applied',
    'o commandId repetido não sobrescreve o aplicado',
  );
  const attempts: readonly (readonly [string, () => Promise<unknown>])[] = [
    [
      'signals',
      (): Promise<unknown> =>
        client`INSERT INTO signals (id, user_id, run_id, candle_time, action, score, regime, votes, indicators, reason) VALUES (${Bun.randomUUIDv7()}, ${other.userId}, ${run.id}, 1, 'HOLD', 0, 'none', '[]'::jsonb, '{}'::jsonb, 'x')`,
    ],
    [
      'orders',
      (): Promise<unknown> =>
        client`INSERT INTO orders (id, user_id, run_id, engine_key, side, type, purpose, status, created_candle_time, last_event_candle_time) VALUES (${Bun.randomUUIDv7()}, ${other.userId}, ${run.id}, 'x', 'buy', 'market', 'entry', 'created', 1, 1)`,
    ],
    [
      'fills',
      (): Promise<unknown> =>
        client`INSERT INTO fills (id, user_id, run_id, order_key, position_key, candle_time, side, price, quantity, notional, fee) VALUES (${Bun.randomUUIDv7()}, ${other.userId}, ${run.id}, 'x', 'p', 1, 'buy', 1, 1, 1, 0)`,
    ],
    [
      'positions',
      (): Promise<unknown> =>
        client`INSERT INTO positions (id, user_id, run_id, engine_key, status, entry_price, quantity, stop_price, target_price, entry_fee, opened_candle_time) VALUES (${Bun.randomUUIDv7()}, ${other.userId}, ${run.id}, 'x', 'open', 1, 1, 1, 1, 0, 1)`,
    ],
    [
      'equity_points',
      (): Promise<unknown> =>
        client`INSERT INTO equity_points (user_id, run_id, candle_time, equity, equity_at_low, benchmark) VALUES (${other.userId}, ${run.id}, 1, 1, 1, 1)`,
    ],
    [
      'run_commands',
      (): Promise<unknown> =>
        client`INSERT INTO run_commands (id, user_id, run_id, command_id, kind, reason, issued_at, candle_time, status) VALUES (${Bun.randomUUIDv7()}, ${other.userId}, ${run.id}, 'x', 'halt', 'user_stop', 1, 1, 'applied')`,
    ],
  ];
  for (const [table, attempt] of attempts) {
    const code = await attempt().then(
      () => 'inserido',
      (error: unknown) => readPostgresErrorCode(error),
    );
    assertCondition(
      code === FOREIGN_KEY_VIOLATION,
      `${table}: user_id alheio para run_id de outro dono -> ${String(code)}`,
    );
  }
  reportCheck(
    'FK composta: o banco recusa as 6 tabelas de resultado com user_id diferente do dono do run_id',
  );
}
