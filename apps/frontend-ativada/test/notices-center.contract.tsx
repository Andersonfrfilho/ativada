// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import type { Notice } from '../src/notices/notice.validation.js';
import {
  buildCancelledNotice,
  buildExitNotice,
  buildFilledNotice,
  buildNotice,
  createNoticeFeed,
  MINUTE,
  NOTICE_RUN_ID,
  OTHER_RUN_ID,
  type NoticeFeedScript,
} from './support/notice-fixtures.js';
import { renderApp, type RenderedApp } from './support/render-app.js';

const STACK = 'Avisos recentes';

function recent(minutes: number): { readonly occurredAt: string } {
  return { occurredAt: new Date(Date.now() - minutes * MINUTE).toISOString() };
}

function created(overrides: Partial<Notice> = {}): Notice {
  return buildNotice({ ...recent(5), ...overrides });
}

function filled(overrides: Partial<Notice> = {}): Notice {
  return buildFilledNotice({ ...recent(1), ...overrides });
}

type Rig = { readonly app: RenderedApp; readonly feed: NoticeFeedScript };

function mount(
  options: {
    readonly runs?: readonly Notice[];
    readonly path?: string;
    readonly toastMilliseconds?: number;
    readonly connectionMilliseconds?: number;
  } = {},
): Rig {
  const feed = createNoticeFeed({ runs: options.runs ?? [] });
  const app = renderApp({
    path: options.path ?? '/conta',
    isAuthenticated: true,
    routes: feed.route,
    noticeToastMilliseconds: options.toastMilliseconds ?? 60_000,
    noticeConnectionMilliseconds: options.connectionMilliseconds ?? 20,
  });
  return { app, feed };
}

async function bell(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /^Avisos:/ });
}

// Um passo de vela: o servidor muda a lista, o stream avisa e o painel refaz a consulta (debounce de 500 ms).
function pushEvent(rig: Rig, runs: readonly Notice[]): void {
  rig.feed.runs = runs;
  act(() =>
    rig.app.stream.emit({
      type: 'event',
      runId: NOTICE_RUN_ID,
      kind: 'balance',
      eventId: String(Math.random()),
      at: Date.now(),
    }),
  );
}

async function waitForStack(): Promise<HTMLElement> {
  return waitFor(() => screen.getByRole('list', { name: STACK }));
}

describe('sino e primeiro carregamento (RF08, RF11)', () => {
  test('o sino fica no cabeçalho com o contador; o primeiro carregamento não vira toast', async () => {
    mount({ runs: [created()] });
    const button = await screen.findByRole('button', { name: 'Avisos: 1 não lido' });
    expect(button).toBeDefined();
    expect(screen.queryByRole('list', { name: STACK })).toBeNull();
  });

  test('sem avisos: "nenhum não lido" e a gaveta mostra o vazio amigável com o atalho', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: nenhum não lido' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    expect(within(dialog).getByText('Sem avisos ainda')).toBeDefined();
    expect(
      within(dialog).getByText('Quando uma simulação comprar ou vender, aparece aqui.'),
    ).toBeDefined();
    expect(within(dialog).getByRole('link', { name: 'Começar uma simulação' })).toBeDefined();
  });

  test('o balão do primeiro uso aparece uma vez e some em "Entendi"', async () => {
    mount({ runs: [created()] });
    expect(
      await screen.findByText(
        'Seus avisos ficam aqui. Já estão ligados para compras, vendas e paradas.',
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(screen.queryByText(/Seus avisos ficam aqui/)).toBeNull());
    expect(window.localStorage.getItem('ativada.notices.anonymous')).toContain(
      '"hasSeenCoach":true',
    );
  });
});

describe('o ciclo da ordem é um toast que muda de estado (RF03, RF05)', () => {
  test('pedida, depois executada: o MESMO toast troca de texto e o anúncio fala só a troca', async () => {
    const rig = mount();
    await bell();
    pushEvent(rig, [created()]);
    const stack = await waitFor(() => within(screen.getByRole('list', { name: STACK })));
    await stack.findByText('Compra pedida');
    expect(
      stack.getByText(
        /Executa pelo preço de abertura da vela das \d\d:\d\d; a simulação confirma às \d\d:\d\d\./,
      ),
    ).toBeDefined();
    expect(stack.getByText(/Vai cancelar\? Cancela se a estratégia mudar de ideia/)).toBeDefined();

    pushEvent(rig, [filled()]);
    await stack.findByText(
      'Sinal de compra: LINK/USDT a 12,458 · vender no alvo 12,590 · sair se cair a 12,379.',
    );
    expect(stack.queryByText('Compra pedida')).toBeNull();
    expect(stack.getAllByRole('listitem')).toHaveLength(1);
    expect(
      stack.getByText('Simulação com dinheiro fictício · tendência, não promessa'),
    ).toBeDefined();
    expect(screen.getByRole('status', { name: 'Anúncio dos avisos' }).textContent).toContain(
      'Sinal de compra · executada',
    );
    expect(stack.getByRole('link', { name: 'Ver no gráfico' }).getAttribute('href')).toBe(
      `/backtests/${NOTICE_RUN_ID}?operacao=position-1#grafico`,
    );
  });

  test('cancelada por sinal contrário: palavra "Cancelada" e a frase em cinza, sem erro', async () => {
    const rig = mount();
    await bell();
    pushEvent(rig, [buildCancelledNotice({ ...recent(1) })]);
    const stack = await waitFor(() => within(screen.getByRole('list', { name: STACK })));
    await stack.findByText('A estratégia mudou de ideia antes de executar.');
    expect(stack.getByText('Cancelada')).toBeDefined();
  });

  test('o aviso some sozinho, pausa com o mouse e não marca como lido', async () => {
    const rig = mount({ toastMilliseconds: 150 });
    await bell();
    pushEvent(rig, [filled()]);
    const stack = await waitFor(() => within(screen.getByRole('list', { name: STACK })));
    const item = await stack.findByRole('listitem');
    fireEvent.mouseOver(item);
    await act(() => Bun.sleep(300));
    expect(screen.queryByRole('list', { name: STACK })).not.toBeNull();
    fireEvent.mouseOut(item, { relatedTarget: document.body });
    await act(() => Bun.sleep(400));
    expect(screen.queryByRole('list', { name: STACK })).toBeNull();
    expect(screen.getByRole('button', { name: 'Avisos: 1 não lido' })).toBeDefined();
  });

  test('no máximo 3 visíveis; o resto vira "+N no sino"', async () => {
    const rig = mount();
    await bell();
    const many = [1, 2, 3, 4, 5].map((index) =>
      buildExitNotice({ ...recent(index), noticeId: `exit:run:${index}` }),
    );
    pushEvent(rig, many);
    const stack = within(await waitForStack());
    await waitFor(() => expect(stack.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3));
    expect(stack.getByRole('button', { name: '+2 no sino' })).toBeDefined();
  });

  test('fechar o aviso o tira da tela mas o sino continua contando', async () => {
    const rig = mount();
    await bell();
    pushEvent(rig, [filled()]);
    const stack = await waitFor(() => within(screen.getByRole('list', { name: STACK })));
    fireEvent.click(await stack.findByRole('button', { name: 'Fechar aviso' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: STACK })).toBeNull());
    expect(screen.getByRole('button', { name: 'Avisos: 1 não lido' })).toBeDefined();
  });
});

describe('preferências (RF15)', () => {
  test('desligar "comprar ou vender" tira o toast e o sino continua contando', async () => {
    const rig = mount();
    fireEvent.click(await bell());
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar' }));
    const trade = await screen.findByRole('switch', { name: 'Avisar quando comprar ou vender' });
    expect(trade.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(trade);
    expect(trade.getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    pushEvent(rig, [filled()]);
    await screen.findByRole('button', { name: 'Avisos: 1 não lido' });
    await Bun.sleep(100);
    expect(screen.queryByRole('list', { name: STACK })).toBeNull();
    expect(window.localStorage.getItem('ativada.notices.anonymous')).toContain(
      '"isTradeEnabled":false',
    );
  });

  test('os três interruptores existem; o navegador só é consultado quando a pessoa clica em Ativar notificações', async () => {
    const requests: string[] = [];
    class FakeNotification {
      static permission = 'default';
      static requestPermission(): Promise<string> {
        requests.push('pedido');
        FakeNotification.permission = 'granted';
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(globalThis, 'Notification', {
      value: FakeNotification,
      configurable: true,
    });
    mount();
    fireEvent.click(await bell());
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustar' }));
    expect((await screen.findByRole('switch', { name: 'Som' })).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(
      screen.getByRole('switch', { name: 'Avisar quando algo parar' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar notificações' }));
    await screen.findByRole('button', { name: 'Desligar notificações' });
    expect(requests).toEqual(['pedido']);
    expect(window.localStorage.getItem('ativada.notices.anonymous')).toContain(
      '"isBrowserEnabled":true',
    );
    Reflect.deleteProperty(globalThis, 'Notification');
  });

  test('"Silenciar esta simulação" no aviso: os próximos entram no sino sem toast', async () => {
    const rig = mount();
    await bell();
    pushEvent(rig, [filled()]);
    const stack = await waitFor(() => within(screen.getByRole('list', { name: STACK })));
    fireEvent.click(await stack.findByRole('button', { name: 'Silenciar esta simulação' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: STACK })).toBeNull());
    pushEvent(rig, [filled(), buildExitNotice({ ...recent(0) })]);
    await screen.findByRole('button', { name: 'Avisos: 2 não lidos' });
    await Bun.sleep(100);
    expect(screen.queryByRole('list', { name: STACK })).toBeNull();
  });
});

describe('a simulação aberta na tela (RF06, D8-A)', () => {
  test('na tela da própria simulação não há toast; o sino conta', async () => {
    const rig = mount({ path: `/backtests/${NOTICE_RUN_ID}` });
    await bell();
    pushEvent(rig, [filled()]);
    await screen.findByRole('button', { name: 'Avisos: 1 não lido' });
    await Bun.sleep(100);
    expect(screen.queryByRole('list', { name: STACK })).toBeNull();
  });

  test('o aviso de OUTRA simulação aparece, em forma compacta, mesmo com um gráfico aberto', async () => {
    const rig = mount({ path: `/backtests/${OTHER_RUN_ID}` });
    await bell();
    pushEvent(rig, [filled()]);
    const stack = await waitForStack();
    expect(within(stack).getByText(/Sinal de compra: LINK\/USDT a 12,458/)).toBeDefined();
  });
});

describe('gaveta (RF09)', () => {
  test('foco no título, Esc fecha e devolve o foco ao sino, Tab não escapa', async () => {
    mount({ runs: [created(), filled({ noticeId: 'order:run:order-9' })] });
    const button = await bell();
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H2'));
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], summary'));
    const last = focusable[focusable.length - 1];
    last?.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  test('frase fixa, "Hoje", itens com "Novo" e "Marcar todos como lidos" zera o contador', async () => {
    mount({ runs: [created(), filled({ noticeId: 'order:run:order-9' })] });
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: 2 não lidos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    expect(
      within(dialog).getByText('Simulações com dinheiro fictício. Não é recomendação.'),
    ).toBeDefined();
    expect(within(dialog).getByRole('heading', { name: 'Hoje' })).toBeDefined();
    expect(within(dialog).getAllByText('Novo')).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar todos como lidos' }));
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
    expect(within(dialog).queryAllByText('Novo')).toHaveLength(0);
  });

  test('filtro por simulação mostra só os avisos daquela simulação', async () => {
    mount({
      runs: [
        created({ noticeId: 'a', runId: NOTICE_RUN_ID }),
        created({ noticeId: 'b', runId: OTHER_RUN_ID, symbol: 'BTCUSDT', timeframe: '1h' }),
      ],
    });
    fireEvent.click(await bell());
    const dialog = await screen.findByRole('dialog', { name: 'Avisos' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'BTC/USDT 1 h' }));
    expect(within(dialog).getAllByText('BTC/USDT 1 h').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('LINK/USDT 15 min', { selector: 'p' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Todas' }));
    expect(
      within(dialog).getAllByText('LINK/USDT 15 min', { selector: 'p' }).length,
    ).toBeGreaterThan(0);
  });
});

describe('conexão caída e resumo ao voltar (RF19, RF20)', () => {
  test('reconectando além do prazo: faixa na gaveta e ponto âmbar no sino; ao voltar, UM resumo', async () => {
    const rig = mount();
    await bell();
    act(() => rig.app.stream.setStatus('reconnecting'));
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido · pausados, reconectando' });
    fireEvent.click(screen.getByRole('button', { name: /pausados/ }));
    expect(await screen.findByText('Avisos pausados — reconectando…')).toBeDefined();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    act(() => rig.app.stream.setStatus('live'));
    rig.feed.runs = [
      filled(),
      buildExitNotice({ ...recent(0) }),
      buildCancelledNotice({ ...recent(0) }),
    ];
    act(() => rig.app.stream.resync());
    const toast = await screen.findByText(
      'Enquanto você estava fora: 2 operações (1 compra, 1 venda) e 1 ordem cancelada.',
    );
    expect(toast).toBeDefined();
    expect(screen.queryByText('Sinal de compra · executada')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver no sino' })).toBeDefined();
  });

  test('socket parado: a faixa diz para entrar de novo', async () => {
    const rig = mount();
    fireEvent.click(await bell());
    act(() => rig.app.stream.setStatus('blocked'));
    expect(await screen.findByText('Avisos parados. Entre de novo.')).toBeDefined();
  });
});
