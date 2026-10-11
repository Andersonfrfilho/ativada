// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  createAssetsHarness,
  type AssetsHarness,
} from './fixtures/api-routes/assets-harness.fixture.js';
import {
  MISSING_ID,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
} from './fixtures/api-routes/runs-harness.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';

const ASSETS = '/v1/assets';
const MISSING_SYMBOL = 'DOGEUSDT';

type AssetData = {
  id: string;
  symbol: string;
  quantity: string;
  averagePrice: string;
  createdAt: string;
  updatedAt: string;
};
type ErrorBody = {
  error: { code: string; details?: { field: string; reason: string }[] };
};

let harness: AssetsHarness;

beforeAll(async () => {
  harness = await createAssetsHarness({ maxAssets: 100 });
});

afterAll(async () => {
  await harness.stop();
});

function call(
  subject: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return harness.call({ subject, method, path, body });
}

async function put(
  subject: string,
  symbol: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  return readJson(await call(subject, 'PUT', `${ASSETS}/${symbol}`, body));
}

async function patch(
  subject: string,
  symbol: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  return readJson(await call(subject, 'PATCH', `${ASSETS}/${symbol}`, body));
}

function dataOf(result: { body: unknown }): AssetData {
  return (result.body as { data: AssetData }).data;
}

describe('autenticação', () => {
  test.each([
    ['GET', ASSETS],
    ['GET', `${ASSETS}/summary`],
    ['GET', `${ASSETS}/BTCUSDT`],
    ['PUT', `${ASSETS}/BTCUSDT`],
    ['PATCH', `${ASSETS}/BTCUSDT`],
    ['DELETE', `${ASSETS}/BTCUSDT`],
  ])('%s %s exige token', async (method, path) => {
    expect((await call(undefined, method, path, { quantity: '1', averagePrice: '1' })).status).toBe(
      401,
    );
  });
});

describe('PUT /v1/assets/:symbol — a posição como o usuário a digitou', () => {
  test('cadastra e devolve a grafia canônica, sem o dono', async () => {
    const result = await put(SUBJECT_A, 'BTCUSDT', { quantity: '0.50', averagePrice: '60000.10' });
    expect(result.status).toBe(200);
    const data = dataOf(result);
    expect(data).toMatchObject({ symbol: 'BTCUSDT', quantity: '0.5', averagePrice: '60000.1' });
    expect(Object.keys(data).sort()).toStrictEqual([
      'averagePrice',
      'createdAt',
      'id',
      'quantity',
      'symbol',
      'updatedAt',
    ]);
  });

  test('de novo substitui a posição (mesma linha)', async () => {
    const first = dataOf(await put(SUBJECT_A, 'ETHUSDT', { quantity: '2', averagePrice: '3000' }));
    const second = dataOf(await put(SUBJECT_A, 'ETHUSDT', { quantity: '3', averagePrice: '3100' }));
    expect(second).toMatchObject({ id: first.id, quantity: '3', averagePrice: '3100' });
  });

  test('a resposta bate com o esquema documentado', async () => {
    const route = harness.routes.find(
      (candidate) => candidate.path === `${ASSETS}/:symbol` && candidate.method === 'PUT',
    );
    const result = await put(SUBJECT_A, 'BNBUSDT', { quantity: '1', averagePrice: '600' });
    expect(
      route?.documentation?.successes[0]?.schema?.safeParse((result.body as { data: unknown }).data)
        .success,
    ).toBe(true);
  });

  test('inválido: TODOS os problemas de uma vez, sem eco de valor', async () => {
    const response = await call(SUBJECT_A, 'PUT', `${ASSETS}/BTCUSDT`, {
      quantity: 'valor-secreto-1',
      averagePrice: '-5',
    });
    const text = await response.text();
    const parsed = JSON.parse(text) as ErrorBody;
    expect(response.status).toBe(400);
    expect(parsed.error.code).toBe('REQUEST_VALIDATION_FAILED');
    expect((parsed.error.details ?? []).map((detail) => detail.field).sort()).toStrictEqual([
      'averagePrice',
      'quantity',
    ]);
    expect(text).not.toContain('valor-secreto');
  });

  test.each([
    ['quantidade zero', { quantity: '0', averagePrice: '1' }],
    ['preço médio zero', { quantity: '1', averagePrice: '0' }],
    ['9 casas', { quantity: '1.123456789', averagePrice: '1' }],
    ['notação científica', { quantity: '1e3', averagePrice: '1' }],
    ['como número', { quantity: 1, averagePrice: '1' }],
    ['campo desconhecido', { quantity: '1', averagePrice: '1', extra: 1 }],
    ['userId no corpo', { quantity: '1', averagePrice: '1', userId: MISSING_ID }],
    ['faltando o preço', { quantity: '1' }],
  ])('recusa: %s', async (_name, body) => {
    expect((await put(SUBJECT_A, 'BTCUSDT', body)).status).toBe(400);
  });

  test('par que a plataforma não acompanha é 400 no campo symbol; par malformado é 404', async () => {
    const refused = await put(SUBJECT_A, MISSING_SYMBOL, { quantity: '1', averagePrice: '1' });
    expect(refused.status).toBe(400);
    expect((refused.body as ErrorBody).error.details).toStrictEqual([
      { field: 'symbol', reason: 'not_enabled' },
    ]);
    expect((await put(SUBJECT_A, 'btcusdt', { quantity: '1', averagePrice: '1' })).status).toBe(
      404,
    );
  });

  test('userId no corpo nunca vira dono: o ativo é de quem tem o token', async () => {
    const before = harness.userAssets.allOf(harness.scopeOf(SUBJECT_A)).length;
    await put(SUBJECT_B, 'XRPUSDT', { quantity: '1', averagePrice: '1', userId: MISSING_ID });
    expect(harness.userAssets.allOf(harness.scopeOf(SUBJECT_A)).length).toBe(before);
  });
});

describe('PATCH /v1/assets/:symbol — compra e venda', () => {
  test('compras recalculam o preço médio ponderado; a venda desconta e o médio fica', async () => {
    await put(SUBJECT_B, 'SOLUSDT', { quantity: '0.5', averagePrice: '60000' });
    const bought = dataOf(
      await patch(SUBJECT_B, 'SOLUSDT', { side: 'buy', quantity: '0.25', price: '66000' }),
    );
    expect(bought).toMatchObject({ quantity: '0.75', averagePrice: '62000' });
    const third = dataOf(
      await patch(SUBJECT_B, 'SOLUSDT', { side: 'buy', quantity: '0.75', price: '58000' }),
    );
    expect(third).toMatchObject({ quantity: '1.5', averagePrice: '60000' });
    const sold = dataOf(await patch(SUBJECT_B, 'SOLUSDT', { side: 'sell', quantity: '0.5' }));
    expect(sold).toMatchObject({ quantity: '1', averagePrice: '60000' });
  });

  test('comprar um par novo cria a posição; vender tudo deixa a quantidade em zero', async () => {
    const created = dataOf(
      await patch(SUBJECT_B, 'BNBUSDT', { side: 'buy', quantity: '2', price: '600' }),
    );
    expect(created).toMatchObject({ quantity: '2', averagePrice: '600' });
    const closed = dataOf(await patch(SUBJECT_B, 'BNBUSDT', { side: 'sell', quantity: '2' }));
    expect(closed).toMatchObject({ quantity: '0', averagePrice: '600' });
    const reopened = dataOf(
      await patch(SUBJECT_B, 'BNBUSDT', { side: 'buy', quantity: '1', price: '700' }),
    );
    expect(reopened).toMatchObject({ quantity: '1', averagePrice: '700' });
  });

  test('vender mais do que há é 409 e não grava nada', async () => {
    await put(SUBJECT_B, 'XRPUSDT', { quantity: '10', averagePrice: '2' });
    const result = await patch(SUBJECT_B, 'XRPUSDT', { side: 'sell', quantity: '10.00000001' });
    expect(result.status).toBe(409);
    expect((result.body as ErrorBody).error.code).toBe('ASSET_INSUFFICIENT_QUANTITY');
    const current = (await readJson(await call(SUBJECT_B, 'GET', `${ASSETS}/XRPUSDT`))).body as {
      data: AssetData;
    };
    expect(current.data.quantity).toBe('10');
  });

  test('vender um ativo que não tem é o mesmo 404 de um ativo inexistente', async () => {
    const result = await patch(SUBJECT_B, 'ETHUSDT', { side: 'sell', quantity: '1' });
    expect(result.status).toBe(404);
    expect((result.body as ErrorBody).error.code).toBe('ASSET_NOT_FOUND');
  });

  test('comprar um par que a plataforma não acompanha é 400; vender um par fora da lista, não é 400', async () => {
    const buy = await patch(SUBJECT_B, MISSING_SYMBOL, { side: 'buy', quantity: '1', price: '1' });
    expect(buy.status).toBe(400);
    const sell = await patch(SUBJECT_B, MISSING_SYMBOL, { side: 'sell', quantity: '1' });
    expect(sell.status).toBe(404);
  });

  test.each([
    ['sem o lado', { quantity: '1', price: '1' }],
    ['lado desconhecido', { side: 'hold', quantity: '1' }],
    ['compra sem preço', { side: 'buy', quantity: '1' }],
    ['venda com preço', { side: 'sell', quantity: '1', price: '1' }],
    ['quantidade zero', { side: 'sell', quantity: '0' }],
    ['userId no corpo', { side: 'sell', quantity: '1', userId: MISSING_ID }],
  ])('recusa: %s', async (_name, body) => {
    expect((await patch(SUBJECT_B, 'XRPUSDT', body)).status).toBe(400);
  });
});

describe('GET, lista e DELETE', () => {
  test('lista em ordem alfabética do par, por cursor, só os do dono', async () => {
    for (const symbol of ['XRPUSDT', 'BNBUSDT', 'BTCUSDT']) {
      await put('subject-runs-a', symbol, { quantity: '1', averagePrice: '1' });
    }
    const first = (await readJson(await call(SUBJECT_A, 'GET', `${ASSETS}?limit=2`))).body as {
      data: AssetData[];
      pagination: { nextCursor: string | null };
    };
    expect(first.data.map((row) => row.symbol)).toStrictEqual(['BNBUSDT', 'BTCUSDT']);
    const second = (
      await readJson(
        await call(SUBJECT_A, 'GET', `${ASSETS}?limit=2&cursor=${first.pagination.nextCursor}`),
      )
    ).body as { data: AssetData[] };
    expect(second.data.map((row) => row.symbol)).toStrictEqual(['ETHUSDT', 'XRPUSDT']);
  });

  test('cursor adulterado é 400', async () => {
    expect((await call(SUBJECT_A, 'GET', `${ASSETS}?cursor=lixo`)).status).toBe(400);
  });

  test('apagar devolve 204 e depois o ativo some', async () => {
    await put(SUBJECT_A, 'BNBUSDT', { quantity: '1', averagePrice: '1' });
    expect((await call(SUBJECT_A, 'DELETE', `${ASSETS}/BNBUSDT`)).status).toBe(204);
    expect((await call(SUBJECT_A, 'GET', `${ASSETS}/BNBUSDT`)).status).toBe(404);
    expect((await call(SUBJECT_A, 'DELETE', `${ASSETS}/BNBUSDT`)).status).toBe(404);
  });
});

describe('teto de ativos por usuário', () => {
  let capped: AssetsHarness;

  beforeAll(async () => {
    capped = await createAssetsHarness({ maxAssets: 2 });
  });

  afterAll(async () => {
    await capped.stop();
  });

  test('o ativo novo acima do teto é 409; o que já existe se atualiza; o teto é por usuário', async () => {
    const send = (subject: string, symbol: string, method = 'PUT'): Promise<Response> =>
      capped.call({
        subject,
        method,
        path: `${ASSETS}/${symbol}`,
        body: { quantity: '1', averagePrice: '1' },
      });
    expect((await send(SUBJECT_A, 'BTCUSDT')).status).toBe(200);
    expect((await send(SUBJECT_A, 'ETHUSDT')).status).toBe(200);
    const blocked = await readJson(await send(SUBJECT_A, 'BNBUSDT'));
    expect(blocked.status).toBe(409);
    expect((blocked.body as ErrorBody).error.code).toBe('ASSET_LIMIT_REACHED');
    expect((await send(SUBJECT_A, 'BTCUSDT')).status).toBe(200);
    expect((await send(SUBJECT_B, 'BNBUSDT')).status).toBe(200);
  });
});

describe('contrato negativo entre usuários', () => {
  test('o ativo de A é, para B, idêntico a um ativo inexistente: ler, comprar, vender, substituir e apagar', async () => {
    await put(SUBJECT_A, 'ETHUSDT', { quantity: '5', averagePrice: '200' });
    const calls: readonly [string, Record<string, unknown> | undefined][] = [
      ['GET', undefined],
      ['DELETE', undefined],
      ['PATCH', { side: 'sell', quantity: '1' }],
    ];
    for (const [method, body] of calls) {
      await expectIndistinguishableNotFound({
        expectedCode: 'ASSET_NOT_FOUND',
        foreignResourceResponse: await call(SUBJECT_B, method, `${ASSETS}/ETHUSDT`, body),
        missingResourceResponse: await call(SUBJECT_B, method, `${ASSETS}/ADAUSDT`, body),
      });
    }
  });

  test('B não lista o ativo de A, e as tentativas de B deixam o de A intacto; o mesmo par em B é outra linha', async () => {
    await call(SUBJECT_B, 'DELETE', `${ASSETS}/ETHUSDT`);
    const listed = (await readJson(await call(SUBJECT_B, 'GET', `${ASSETS}?limit=100`))).body as {
      data: AssetData[];
    };
    const own = dataOf(await put(SUBJECT_B, 'ETHUSDT', { quantity: '9', averagePrice: '9' }));
    const original = (await readJson(await call(SUBJECT_A, 'GET', `${ASSETS}/ETHUSDT`))).body as {
      data: AssetData;
    };
    expect(listed.data.some((row) => row.quantity === '5')).toBe(false);
    expect(original.data).toMatchObject({ quantity: '5', averagePrice: '200' });
    expect(own.id).not.toBe(original.data.id);
  });
});
