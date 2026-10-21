// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { describeNotification } from '../src/notices/notice-browser.js';
import { playNoticeSound, primeNoticeSound } from '../src/notices/notice-sound.js';
import {
  buildExitNotice,
  buildFilledNotice,
  createNoticeFeed,
  MINUTE,
} from './support/notice-fixtures.js';
import { renderApp } from './support/render-app.js';

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  setVisibility('visible');
  document.title = '';
  Reflect.deleteProperty(globalThis, 'Notification');
  Reflect.deleteProperty(globalThis, 'AudioContext');
});

function recent(minutes: number): { readonly occurredAt: string } {
  return { occurredAt: new Date(Date.now() - minutes * MINUTE).toISOString() };
}

describe('título e ícone da aba (RF12)', () => {
  test('com a aba escondida vira "(1) AtivAdA" e o ícone ganha o ponto; ao voltar, volta ao normal', async () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('href', '/icon-192.png');
    link.setAttribute('type', 'image/png');
    document.head.append(link);
    document.title = 'AtivAdA';
    const feed = createNoticeFeed({ runs: [buildFilledNotice({ ...recent(1) })] });
    renderApp({ path: '/conta', isAuthenticated: true, routes: feed.route });
    await screen.findByRole('button', { name: 'Avisos: 1 não lido' });
    expect(document.title).toBe('AtivAdA');
    act(() => setVisibility('hidden'));
    await waitFor(() => expect(document.title).toBe('(1) AtivAdA'));
    expect(link.getAttribute('href')).toBe('/icon-dot.svg');
    act(() => setVisibility('visible'));
    await waitFor(() => expect(document.title).toBe('AtivAdA'));
    expect(link.getAttribute('href')).toBe('/icon-192.png');
    link.remove();
  });

  test('sem não lidos o título não muda mesmo com a aba escondida', async () => {
    document.title = 'AtivAdA';
    const feed = createNoticeFeed();
    renderApp({ path: '/conta', isAuthenticated: true, routes: feed.route });
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
    act(() => setVisibility('hidden'));
    await Bun.sleep(30);
    expect(document.title).toBe('AtivAdA');
  });
});

describe('notificação do navegador (RF13, D9-A)', () => {
  test('compra: título com par e preço, corpo com alvo e proteção e a frase do dinheiro fictício', () => {
    const { title, body } = describeNotification(buildFilledNotice(), 'UTC');
    expect(title).toBe('▲ Sinal de compra · LINK/USDT a 12,458');
    expect(body).toBe('Alvo 12,590 · sair se cair a 12,379. Simulação com dinheiro fictício.');
  });

  test('venda e demais: par no título e a frase do servidor no corpo', () => {
    const sell = describeNotification(buildExitNotice(), 'UTC');
    expect(sell.title).toBe('▼ Sinal de venda · LINK/USDT a 12,372');
    expect(sell.body).toBe(
      'Caiu até a saída de proteção (12,379). Simulação com dinheiro fictício.',
    );
  });

  test('com a aba escondida e a permissão dada, cada aviso vira uma notificação com tag = noticeId', async () => {
    const created: { title: string; options: { body: string; tag: string } }[] = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(title: string, options: { body: string; tag: string }) {
        created.push({ title, options });
      }
      static requestPermission(): Promise<string> {
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(globalThis, 'Notification', {
      value: FakeNotification,
      configurable: true,
    });
    window.localStorage.setItem(
      'ativada.notices.anonymous',
      JSON.stringify({ isBrowserEnabled: true }),
    );
    const feed = createNoticeFeed();
    const app = renderApp({ path: '/conta', isAuthenticated: true, routes: feed.route });
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
    act(() => setVisibility('hidden'));
    feed.runs = [buildFilledNotice({ ...recent(1) })];
    act(() =>
      app.stream.emit({
        type: 'event',
        runId: 'r',
        kind: 'balance',
        eventId: 'e1',
        at: Date.now(),
      }),
    );
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]?.options.tag).toBe('order:run:order-1');
    expect(created[0]?.title).toBe('▲ Sinal de compra · LINK/USDT a 12,458');
  });

  test('sem permissão concedida nada é criado nem pedido', async () => {
    const created: string[] = [];
    class FakeNotification {
      static permission = 'default';
      constructor(title: string) {
        created.push(title);
      }
      static requestPermission(): Promise<string> {
        created.push('PEDIDO');
        return Promise.resolve('granted');
      }
    }
    Object.defineProperty(globalThis, 'Notification', {
      value: FakeNotification,
      configurable: true,
    });
    window.localStorage.setItem(
      'ativada.notices.anonymous',
      JSON.stringify({ isBrowserEnabled: true }),
    );
    const feed = createNoticeFeed();
    const app = renderApp({ path: '/conta', isAuthenticated: true, routes: feed.route });
    await screen.findByRole('button', { name: 'Avisos: nenhum não lido' });
    act(() => setVisibility('hidden'));
    feed.runs = [buildFilledNotice({ ...recent(1) })];
    act(() =>
      app.stream.emit({
        type: 'event',
        runId: 'r',
        kind: 'balance',
        eventId: 'e1',
        at: Date.now(),
      }),
    );
    await Bun.sleep(900);
    expect(created).toEqual([]);
    fireEvent.focus(document.body);
  });
});

describe('som (RF14): dois tons curtos, só depois do gesto', () => {
  type Voice = {
    frequency: { value: number };
    connect: () => void;
    start: () => void;
    stop: () => void;
  };

  function installAudio(): { voices: Voice[]; constructed: () => number } {
    const voices: Voice[] = [];
    let constructed = 0;
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      constructor() {
        constructed += 1;
      }
      createOscillator(): Voice {
        const voice = {
          frequency: { value: 0 },
          connect: (): void => undefined,
          start: (): void => undefined,
          stop: (): void => undefined,
        };
        voices.push(voice);
        return voice;
      }
      createGain(): { gain: { value: number }; connect: () => void } {
        return { gain: { value: 0 }, connect: () => undefined };
      }
    }
    Object.defineProperty(globalThis, 'AudioContext', {
      value: FakeAudioContext,
      configurable: true,
    });
    return { voices, constructed: () => constructed };
  }

  test('sobe na compra, desce na venda, tom único no resto; antes do gesto não toca nem cria nada', () => {
    const audio = installAudio();
    playNoticeSound(buildFilledNotice());
    expect(audio.voices).toHaveLength(0);
    expect(audio.constructed()).toBe(0);
    primeNoticeSound();
    expect(audio.constructed()).toBe(1);
    playNoticeSound(buildFilledNotice());
    expect(audio.voices.map((voice) => voice.frequency.value)).toEqual([523, 659]);
    playNoticeSound(buildExitNotice());
    expect(audio.voices.slice(2).map((voice) => voice.frequency.value)).toEqual([659, 523]);
    playNoticeSound(buildFilledNotice({ kind: 'run', reasonCode: 'run.stalled' }));
    expect(audio.voices.slice(4).map((voice) => voice.frequency.value)).toEqual([587]);
  });
});
