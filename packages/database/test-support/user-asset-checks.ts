// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  USER_ASSET_DECISION_KIND,
  USER_ASSET_MUTATE_OUTCOME,
} from '../src/user-assets/user-asset.constant.js';
import { createUserAssetRepository } from '../src/user-assets/user-asset.repository.js';
import type {
  UserAssetDecision,
  UserAssetRecord,
  UserAssetRepository,
} from '../src/user-assets/user-asset.types.js';
import type { OwnerScope } from '../src/ownership/owner-scope.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, resolvePersistenceOwner } from './persistence-seed.js';

const CHECK_VIOLATION_SQLSTATE = '23514';
const UNIQUE_VIOLATION_SQLSTATE = '23505';
const RACED_PURCHASES = 20;
const RACED_SYMBOLS = 12;
const ASSET_CEILING = 5;
const FIRST_PAGE_SIZE = 2;

function save(quantity: string, averagePrice: string): UserAssetDecision {
  return { kind: USER_ASSET_DECISION_KIND.SAVE, quantity, averagePrice };
}

async function saved(
  assets: UserAssetRepository,
  scope: OwnerScope,
  params: { readonly symbol: string; readonly quantity: string; readonly averagePrice: string },
): Promise<UserAssetRecord> {
  const result = await assets.mutateUserAsset(scope, {
    symbol: params.symbol,
    maxAssets: 50,
    decide: () => save(params.quantity, params.averagePrice),
  });
  if (result.outcome !== USER_ASSET_MUTATE_OUTCOME.SAVED) throw new Error('ativo não gravado');
  return result.asset;
}

async function checkRoundTrip(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-asset-round-trip');
  const assets = createUserAssetRepository(handle);
  const created = await saved(assets, owner.scope, {
    symbol: 'BTCUSDT',
    quantity: '0.12345678',
    averagePrice: '60000.12345678',
  });
  assertCondition(
    created.quantity === '0.12345678' && created.averagePrice === '60000.12345678',
    'quantidade e preço médio voltam em texto exato',
  );
  const seen: (UserAssetRecord | undefined)[] = [];
  const updated = await assets.mutateUserAsset(owner.scope, {
    symbol: 'BTCUSDT',
    maxAssets: 50,
    decide: (current) => {
      seen.push(current);
      return save('0.5', '61000');
    },
  });
  assertCondition(seen[0]?.id === created.id, 'a regra recebe a posição atual travada');
  assertCondition(
    updated.outcome === USER_ASSET_MUTATE_OUTCOME.SAVED &&
      updated.asset.id === created.id &&
      updated.asset.quantity === '0.5' &&
      updated.asset.updatedAt.getTime() >= created.updatedAt.getTime(),
    'atualizar mantém a mesma linha e avança updated_at',
  );
  const refused = await assets.mutateUserAsset(owner.scope, {
    symbol: 'BTCUSDT',
    maxAssets: 50,
    decide: () => ({ kind: USER_ASSET_DECISION_KIND.REFUSE, reason: 'insufficient_quantity' }),
  });
  assertCondition(
    refused.outcome === USER_ASSET_MUTATE_OUTCOME.REFUSED &&
      refused.reason === 'insufficient_quantity',
    'a regra pode recusar',
  );
  assertCondition(
    (await assets.findUserAsset(owner.scope, 'BTCUSDT'))?.quantity === '0.5',
    'e a recusa não grava nada',
  );
  await saved(assets, owner.scope, { symbol: 'BTCUSDT', quantity: '0', averagePrice: '61000' });
  assertCondition(
    (await assets.findUserAsset(owner.scope, 'BTCUSDT'))?.quantity === '0',
    'a venda total deixa a posição com quantidade zero',
  );
  assertCondition(await assets.deleteUserAsset(owner.scope, 'BTCUSDT'), 'apaga o próprio ativo');
  assertCondition(!(await assets.deleteUserAsset(owner.scope, 'BTCUSDT')), 'apagar de novo = não');
  reportCheck(
    'ativos: gravar, atualizar na mesma linha, recusar, zerar e apagar; decimais em texto exato',
  );
}

async function checkIsolation(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-asset-owner');
  const stranger = await resolvePersistenceOwner(handle, 'subject-asset-stranger');
  const assets = createUserAssetRepository(handle);
  await saved(assets, owner.scope, { symbol: 'ETHUSDT', quantity: '2', averagePrice: '3000' });
  assertCondition(
    (await assets.findUserAsset(stranger.scope, 'ETHUSDT')) === undefined,
    'outro usuário não lê o ativo',
  );
  assertCondition(!(await assets.deleteUserAsset(stranger.scope, 'ETHUSDT')), 'nem apaga');
  assertCondition(
    (await assets.listUserAssets(stranger.scope)).every((row) => row.symbol !== 'ETHUSDT') &&
      (await assets.listUserAssetsPage(stranger.scope, { limit: 100, after: undefined })).assets
        .length === 0,
    'nem lista',
  );
  const own = await saved(assets, stranger.scope, {
    symbol: 'ETHUSDT',
    quantity: '1',
    averagePrice: '2900',
  });
  const original = await assets.findUserAsset(owner.scope, 'ETHUSDT');
  assertCondition(
    own.id !== original?.id && original?.quantity === '2',
    'o mesmo par em outro dono é outra linha, e a do primeiro fica intacta',
  );
  reportCheck(
    'ativos: o ativo de A é invisível e intocável para B; o mesmo par em B é outra linha',
  );
}

async function checkRaces(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-asset-race');
  const assets = createUserAssetRepository(handle);
  await saved(assets, owner.scope, { symbol: 'SOLUSDT', quantity: '0', averagePrice: '100' });
  await Promise.all(
    Array.from({ length: RACED_PURCHASES }, () =>
      assets.mutateUserAsset(owner.scope, {
        symbol: 'SOLUSDT',
        maxAssets: 50,
        decide: (current) =>
          save(String(Number(current?.quantity ?? '0') + 1), current?.averagePrice ?? '100'),
      }),
    ),
  );
  const final = await assets.findUserAsset(owner.scope, 'SOLUSDT');
  assertCondition(
    final?.quantity === String(RACED_PURCHASES),
    `${final?.quantity} de ${RACED_PURCHASES} compras simultâneas: nenhuma se perde`,
  );
  const ceilingOwner = await resolvePersistenceOwner(handle, 'subject-asset-ceiling');
  const symbols = Array.from({ length: RACED_SYMBOLS }, (_unused, index) => `COIN${index}USDT`);
  const outcomes = await Promise.all(
    symbols.map((symbol) =>
      assets.mutateUserAsset(ceilingOwner.scope, {
        symbol,
        maxAssets: ASSET_CEILING,
        decide: () => save('1', '1'),
      }),
    ),
  );
  const total = outcomes.filter((item) => item.outcome === USER_ASSET_MUTATE_OUTCOME.SAVED).length;
  assertCondition(total === ASSET_CEILING, `${total} ativos criados sob corrida`);
  const update = await assets.mutateUserAsset(ceilingOwner.scope, {
    symbol: 'COIN0USDT',
    maxAssets: ASSET_CEILING,
    decide: () => save('2', '1'),
  });
  assertCondition(
    update.outcome === USER_ASSET_MUTATE_OUTCOME.SAVED ||
      (await assets.listUserAssets(ceilingOwner.scope)).length === ASSET_CEILING,
    'no teto, o ativo que já existe ainda se atualiza',
  );
  reportCheck(
    `ativos: ${RACED_PURCHASES} compras simultâneas somam todas; ${RACED_SYMBOLS} pares simultâneos respeitam o teto de ${ASSET_CEILING}`,
  );
}

async function checkPagination(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-asset-pages');
  const assets = createUserAssetRepository(handle);
  for (const symbol of ['XRPUSDT', 'BNBUSDT', 'ADAUSDT', 'ETHUSDT', 'BTCUSDT']) {
    await saved(assets, owner.scope, { symbol, quantity: '1', averagePrice: '1' });
  }
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const result = await assets.listUserAssetsPage(owner.scope, {
      limit: FIRST_PAGE_SIZE,
      after: cursor,
    });
    seen.push(...result.assets.map((row) => row.symbol));
    cursor = result.nextCursor;
    if (cursor === undefined) break;
  }
  assertCondition(
    seen.join() === 'ADAUSDT,BNBUSDT,BTCUSDT,ETHUSDT,XRPUSDT',
    `páginas em ordem alfabética, sem repetir nem perder: ${seen.join()}`,
  );
  reportCheck('ativos: paginação por símbolo, em ordem alfabética, sem repetir nem perder linha');
}

async function checkDatabaseRules(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-asset-rules');
  const insert = (fields: {
    symbol: string;
    quantity: string;
    price: string;
  }): PromiseLike<unknown> =>
    client`INSERT INTO user_assets (id, user_id, symbol, quantity, average_price)
      VALUES (${crypto.randomUUID()}, ${owner.userId}, ${fields.symbol}, ${fields.quantity}, ${fields.price})`;
  const valid = { symbol: 'LINKUSDT', quantity: '1', price: '10' };
  const invalid: readonly (readonly [string, typeof valid])[] = [
    ['par em minúsculas', { ...valid, symbol: 'linkusdt' }],
    ['par fora de USDT', { ...valid, symbol: 'LINKBRL' }],
    ['quantidade negativa', { ...valid, quantity: '-1' }],
    ['preço médio zero', { ...valid, price: '0' }],
    ['preço médio negativo', { ...valid, price: '-3' }],
  ];
  for (const [label, fields] of invalid) {
    const code = await captureErrorCode(insert(fields));
    assertCondition(code === CHECK_VIOLATION_SQLSTATE, `${label}: o banco devia recusar (${code})`);
  }
  assertCondition(
    (await captureErrorCode(insert({ ...valid, symbol: 'DOTUSDT', quantity: '0' }))) === undefined,
    'quantidade zero é permitida (venda total)',
  );
  assertCondition((await captureErrorCode(insert(valid))) === undefined, 'o ativo válido entra');
  const duplicate = await captureErrorCode(insert(valid));
  assertCondition(
    duplicate === UNIQUE_VIOLATION_SQLSTATE,
    `um ativo por (dono, par) (${duplicate})`,
  );
  reportCheck(
    'ativos: o banco recusa par, quantidade negativa, preço médio sem valor e par repetido',
  );
}

export async function checkUserAssets(context: LifecycleCheckContext): Promise<void> {
  await checkRoundTrip(context);
  await checkIsolation(context);
  await checkRaces(context);
  await checkPagination(context);
  await checkDatabaseRules(context);
}
