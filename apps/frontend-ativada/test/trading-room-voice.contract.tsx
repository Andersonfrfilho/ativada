// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  dataResponse,
  errorResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { LIVE_BASE, LIVE_RUN_ID, liveRoutes } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness } from './support/team-room-fixtures.js';
import { buildTradePlan } from './support/trade-plan-fixtures.js';

// "Perguntar falando": o microfone grava, o servidor transcreve e a fala vira uma pergunta rápida que a pessoa confirma.

const RECORDED_TYPE = 'audio/webm;codecs=opus';
const START = 'Perguntar falando';

type Microphone = { stoppedTracks: number; isDenied: boolean; requests: number };

const microphone: Microphone = { stoppedTracks: 0, isDenied: false, requests: 0 };

class FakeMediaRecorder extends EventTarget {
  state: RecordingState = 'inactive';
  readonly mimeType = RECORDED_TYPE;
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    const chunk = new Blob([new Uint8Array([26, 69, 223, 163])], { type: RECORDED_TYPE });
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: chunk }));
    this.dispatchEvent(new Event('stop'));
  }
}

const fakeMediaDevices = {
  getUserMedia: (): Promise<{ getTracks: () => { stop: () => void }[] }> => {
    microphone.requests += 1;
    if (microphone.isDenied) return Promise.reject(new Error('NotAllowedError'));
    const track = { stop: (): void => void (microphone.stoppedTracks += 1) };
    return Promise.resolve({ getTracks: () => [track] });
  },
};

function installMicrophone(): void {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    value: FakeMediaRecorder,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: fakeMediaDevices,
    configurable: true,
  });
}

function removeMicrophone(): void {
  Reflect.deleteProperty(globalThis, 'MediaRecorder');
  Reflect.deleteProperty(navigator, 'mediaDevices');
}

beforeEach(() => {
  microphone.stoppedTracks = 0;
  microphone.isDenied = false;
  microphone.requests = 0;
  installMicrophone();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  removeMicrophone();
});

type Spoken = { readonly transcribe: (call: RecordedCall) => Response };

function roomRoutes(spoken: Spoken, calls: RecordedCall[]): readonly FakeRoute[] {
  return [
    ...liveRoutes(createRoomHarness()),
    {
      method: 'GET',
      path: `${LIVE_BASE}/trade-plan`,
      respond: (): Response => dataResponse(buildTradePlan()),
    },
    {
      method: 'POST',
      path: '/v1/transcriptions',
      respond: (call): Response => {
        calls.push(call);
        return spoken.transcribe(call);
      },
    },
    {
      method: 'GET',
      path: `${LIVE_BASE}/questions`,
      respond: (call): Response => {
        calls.push(call);
        return dataResponse({
          version: 'questions-1',
          runId: LIVE_RUN_ID,
          symbol: call.query.get('symbol') ?? 'BTCUSDT',
          question: call.query.get('question') ?? 'trend',
          agent: 'tiago',
          answer: 'Em ETHUSDT, a tendência está de alta.',
          basis: 'exact',
          asOf: null,
          notice: 'Não é recomendação de compra ou venda.',
        });
      },
    },
  ];
}

function saying(text: string): Spoken {
  return { transcribe: (): Response => dataResponse({ text, engine: 'whisper-local' }) };
}

function openRoom(spoken: Spoken, calls: RecordedCall[] = []): void {
  renderApp({
    path: `/backtests/${LIVE_RUN_ID}`,
    isAuthenticated: true,
    routes: roomRoutes(spoken, calls),
  });
}

async function askBox(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Pergunte à equipe' });
}

async function recordAndStop(box: HTMLElement): Promise<void> {
  fireEvent.click(within(box).getByRole('button', { name: START }));
  const recording = await within(box).findByRole('button', { name: /^Gravando… toque para parar/ });
  expect(recording.getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => expect(microphone.requests).toBe(1));
  fireEvent.click(recording);
}

describe('perguntar falando', () => {
  test('grava, manda o áudio cru, mostra o que ouviu e o que entendeu; "Perguntar" usa a moeda falada', async () => {
    const calls: RecordedCall[] = [];
    openRoom(saying('Tiago, como está a tendência do Ethereum?'), calls);
    const box = await askBox();
    await recordAndStop(box);
    await within(box).findByText('Você disse: “Tiago, como está a tendência do Ethereum?”');
    expect(within(box).getByText('Entendi: Como está a tendência? · ETH/USDT')).toBeDefined();
    expect(microphone.stoppedTracks).toBe(1);
    const upload = calls.find((call) => call.path === '/v1/transcriptions');
    expect(upload?.headers.get('Content-Type')).toBe(RECORDED_TYPE);
    fireEvent.click(within(box).getByRole('button', { name: 'Perguntar' }));
    await waitFor(() => expect(calls.some((call) => call.path.endsWith('/questions'))).toBe(true));
    const asked = calls.find((call) => call.path.endsWith('/questions'));
    expect(asked?.query.get('symbol')).toBe('ETHUSDT');
    expect(asked?.query.get('question')).toBe('trend');
    expect(within(box).getByLabelText<HTMLSelectElement>('Moeda').value).toBe('ETHUSDT');
    expect(within(box).queryByText(/^Você disse/)).toBeNull();
  });

  test('sem moeda falada a pergunta vai para a moeda escolhida', async () => {
    openRoom(saying('O RSI está esticado?'));
    const box = await askBox();
    await recordAndStop(box);
    await within(box).findByText('Entendi: O RSI está esticado? · BTC/USDT');
  });

  test('fala sem pergunta do catálogo: avisa e não oferece "Perguntar"; "Cancelar" volta ao começo', async () => {
    openRoom(saying('bom dia, pessoal'));
    const box = await askBox();
    await recordAndStop(box);
    await within(box).findByText('Não entendi qual pergunta. Escolha uma abaixo.');
    expect(within(box).queryByRole('button', { name: 'Perguntar' })).toBeNull();
    fireEvent.click(within(box).getByRole('button', { name: 'Cancelar' }));
    expect(within(box).queryByText(/^Você disse/)).toBeNull();
    expect(within(box).getByRole('button', { name: START })).toBeDefined();
  });

  test('microfone negado, transcrição desligada, ocupada e falha viram frases', async () => {
    microphone.isDenied = true;
    openRoom(saying('qualquer'));
    const box = await askBox();
    fireEvent.click(within(box).getByRole('button', { name: START }));
    await within(box).findByText(/Não foi possível usar o microfone/);
    cleanup();
    microphone.isDenied = false;
    for (const [status, code, text] of [
      [503, 'TRANSCRIPTION_UNAVAILABLE', 'A pergunta por voz está desligada neste servidor.'],
      [503, 'TRANSCRIPTION_BUSY', /O servidor está ocupado/],
      [422, 'TRANSCRIPTION_FAILED', 'Não foi possível entender o áudio. Tente de novo.'],
    ] as const) {
      microphone.requests = 0;
      openRoom({ transcribe: (): Response => errorResponse(status, code) });
      const room = await askBox();
      await recordAndStop(room);
      await within(room).findByText(text);
      cleanup();
    }
  });

  test('a gravação mostra os segundos e para sozinha nos 20 s, mandando o áudio', async () => {
    const calls: RecordedCall[] = [];
    openRoom(saying('Qual é o plano?'), calls);
    const box = await askBox();
    jest.useFakeTimers();
    try {
      fireEvent.click(within(box).getByRole('button', { name: START }));
      // A permissão do microfone chega por promessa (microtarefa), não por temporizador.
      for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
      expect(microphone.requests).toBe(1);
      act(() => {
        jest.advanceTimersByTime(3_000);
      });
      expect(
        within(box).getByRole('button', { name: 'Gravando… toque para parar (3 s de 20)' }),
      ).toBeDefined();
      act(() => {
        jest.advanceTimersByTime(17_000);
      });
      // O envio agenda avisos do React Query em temporizador: eles rodam antes de voltar ao relógio real.
      for (let turn = 0; turn < 10; turn += 1) {
        await Promise.resolve();
        act(() => {
          jest.advanceTimersByTime(1);
        });
      }
    } finally {
      jest.useRealTimers();
    }
    await within(box).findByText('Entendi: Qual é o plano? · BTC/USDT');
    expect(calls.filter((call) => call.path === '/v1/transcriptions')).toHaveLength(1);
    expect(microphone.stoppedTracks).toBe(1);
  });

  test('sair da tela no meio da gravação solta o microfone', async () => {
    openRoom(saying('qualquer'));
    const box = await askBox();
    fireEvent.click(within(box).getByRole('button', { name: START }));
    await waitFor(() => expect(microphone.requests).toBe(1));
    await Bun.sleep(5);
    cleanup();
    expect(microphone.stoppedTracks).toBe(1);
  });

  test('navegador sem gravador de áudio não mostra o botão', async () => {
    removeMicrophone();
    openRoom(saying('qualquer'));
    const box = await askBox();
    expect(within(box).queryByRole('button', { name: START })).toBeNull();
    expect(within(box).getByRole('button', { name: 'Como está a tendência?' })).toBeDefined();
  });
});
