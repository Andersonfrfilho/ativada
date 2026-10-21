// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type {
  AudioTranscriberPort,
  TranscriptionRequest,
} from '../apps/api-ativada/src/transcriptions/audio-transcriber.port.js';
import type {
  TranscribeAudioUseCase,
  TranscriptionFailure,
} from '../apps/api-ativada/src/transcriptions/transcribe-audio.use-case.js';
import {
  createRunsHarness,
  readJson,
  SUBJECT_A,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';

// Pergunta por voz (ADR 0002 "Perguntas à equipe"): o áudio cru vira texto por um motor LOCAL; aqui o motor é um falso.

const PATH = '/v1/transcriptions';
const ONE_MINUTE = 60_001;
const MAX_BYTES = 2 * 1024 * 1024;
const SECRET_PATH = '/home/someone/models/ggml.bin';
const AUDIO = new Uint8Array([26, 69, 223, 163, 1, 2, 3, 4]);

// O formato do erro do SDK (`@adatechnology/audio-transcription-provider`): nome, motor e `isRetriable`.
class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly engine: string,
    readonly isRetriable: boolean,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

type Deferred = { promise: Promise<void>; resolve: () => void };

function createDeferred(): Deferred {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const received: TranscriptionRequest[] = [];
const failures: TranscriptionFailure[] = [];
type Outcome = { text: string; engine: string };
let behaviour: (input: TranscriptionRequest) => Promise<Outcome>;
let transcribe: TranscribeAudioUseCase;
let harness: RunsHarness;

const fake: AudioTranscriberPort = {
  name: 'fake',
  transcribe: (input) => {
    received.push(input);
    return behaviour(input);
  },
};

beforeAll(async () => {
  harness = await createRunsHarness({
    extraRoutes: (app) => [
      app.transcriptionsRoute.createTranscriptionsRoute({
        transcribe: (input) => transcribe(input),
      }),
    ],
  });
});

afterAll(async () => {
  await harness.stop();
});

function useTranscriber(transcriber: AudioTranscriberPort | undefined): void {
  transcribe = harness.app.transcribeAudioUseCase.createTranscribeAudioUseCase({
    transcriber,
    gate: harness.app.transcriptionGate.createTranscriptionGate(3),
    reportFailure: (failure) => failures.push(failure),
  });
}

beforeEach(() => {
  harness.clock.now += ONE_MINUTE;
  received.length = 0;
  failures.length = 0;
  behaviour = (): Promise<Outcome> =>
    Promise.resolve({ text: '  qual a tendência do bitcoin?  ', engine: 'fake' });
  useTranscriber(fake);
});

function post(params: {
  subject?: string;
  contentType?: string;
  body?: Uint8Array<ArrayBuffer>;
}): Promise<Response> {
  return harness.call({
    subject: params.subject,
    method: 'POST',
    path: PATH,
    contentType: params.contentType ?? 'audio/webm;codecs=opus',
    rawBody: params.body ?? AUDIO,
  });
}

async function expectError(response: Response, status: number, code: string): Promise<string> {
  const text = await response.text();
  expect(response.status).toBe(status);
  expect((JSON.parse(text) as { error: { code: string } }).error.code).toBe(code);
  return text;
}

describe('POST /v1/transcriptions', () => {
  test('transcreve o áudio cru: texto aparado, motor, bytes e tipo sem os parâmetros', async () => {
    const response = await readJson(await post({ subject: SUBJECT_A }));
    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      data: { text: 'qual a tendência do bitcoin?', engine: 'fake' },
    });
    expect(received).toHaveLength(1);
    expect([...(received[0]?.buffer ?? [])]).toStrictEqual([...AUDIO]);
    expect(received[0]?.mimeType).toBe('audio/webm');
  });

  test('texto vazio (silêncio) é resposta válida; os quatro tipos de áudio passam', async () => {
    behaviour = (): Promise<Outcome> => Promise.resolve({ text: '   ', engine: 'fake' });
    for (const contentType of ['audio/ogg; codecs=opus', 'audio/mp4', 'audio/wav']) {
      const response = await readJson(await post({ subject: SUBJECT_A, contentType }));
      expect(response.body).toStrictEqual({ data: { text: '', engine: 'fake' } });
    }
  });

  test('sem token é 401 e o motor não é chamado', async () => {
    expect((await post({})).status).toBe(401);
    expect(received).toHaveLength(0);
  });

  test('tipo que não é áudio aceito e corpo vazio são 400 com o motivo estável', async () => {
    for (const contentType of ['application/json', 'audio/mpeg', 'video/webm']) {
      const text = await expectError(
        await post({ subject: SUBJECT_A, contentType }),
        400,
        'REQUEST_VALIDATION_FAILED',
      );
      expect(text).toContain('unsupported_audio_type');
    }
    const empty = await expectError(
      await post({ subject: SUBJECT_A, body: new Uint8Array(0) }),
      400,
      'REQUEST_VALIDATION_FAILED',
    );
    expect(empty).toContain('empty_audio');
    expect(received).toHaveLength(0);
  });

  test('áudio acima de 2 MB é 413 AUDIO_TOO_LARGE; exatamente 2 MB passa', async () => {
    await expectError(
      await post({ subject: SUBJECT_A, body: new Uint8Array(MAX_BYTES + 1) }),
      413,
      'AUDIO_TOO_LARGE',
    );
    expect(received).toHaveLength(0);
    expect((await post({ subject: SUBJECT_A, body: new Uint8Array(MAX_BYTES) })).status).toBe(200);
  });

  test('motor desligado é 503 TRANSCRIPTION_UNAVAILABLE', async () => {
    useTranscriber(undefined);
    await expectError(await post({ subject: SUBJECT_A }), 503, 'TRANSCRIPTION_UNAVAILABLE');
  });

  test('uma por vez e até 3 esperando: a quinta ao mesmo tempo é 503 TRANSCRIPTION_BUSY', async () => {
    const gate = createDeferred();
    behaviour = async (): Promise<Outcome> => {
      await gate.promise;
      return { text: 'ok', engine: 'fake' };
    };
    const pending = [1, 2, 3, 4].map(() => post({ subject: SUBJECT_A }));
    await Bun.sleep(5);
    expect(received).toHaveLength(1);
    await expectError(await post({ subject: SUBJECT_A }), 503, 'TRANSCRIPTION_BUSY');
    gate.resolve();
    const statuses = await Promise.all(
      pending.map(async (call): Promise<number> => (await call).status),
    );
    expect(statuses).toStrictEqual([200, 200, 200, 200]);
    expect(received).toHaveLength(4);
  });

  test('erro definitivo do SDK é 422, o retriável é 503; só nome e código vão ao relato', async () => {
    behaviour = (): Promise<Outcome> =>
      Promise.reject(new TranscriptionError(`ffmpeg em ${SECRET_PATH}`, 'whisper-local', false));
    const definitive = await expectError(
      await post({ subject: SUBJECT_A }),
      422,
      'TRANSCRIPTION_FAILED',
    );
    behaviour = (): Promise<Outcome> =>
      Promise.reject(new TranscriptionError(SECRET_PATH, 'whisper-local', true));
    const retriable = await expectError(
      await post({ subject: SUBJECT_A }),
      503,
      'TRANSCRIPTION_ENGINE_FAILED',
    );
    behaviour = (): Promise<Outcome> => Promise.reject(new Error(SECRET_PATH));
    await expectError(await post({ subject: SUBJECT_A }), 503, 'TRANSCRIPTION_ENGINE_FAILED');
    expect(failures).toStrictEqual([
      { errorName: 'TranscriptionError', errorCode: 'TRANSCRIPTION_FAILED' },
      { errorName: 'TranscriptionError', errorCode: 'TRANSCRIPTION_ENGINE_FAILED' },
      { errorName: 'Error', errorCode: 'TRANSCRIPTION_ENGINE_FAILED' },
    ]);
    expect(`${definitive}${retriable}`).not.toContain(SECRET_PATH);
  });

  test('balde próprio de 6 por minuto por usuário: o 7º pedido no mesmo minuto é 429', async () => {
    const route = harness.routes.find((item) => item.path === PATH);
    expect(route?.access).toBe('user');
    expect(route?.rateLimitPolicy?.name).toBe('transcription');
    expect(route?.rateLimitPolicy?.limit).toBe(6);
    expect(route?.documentation).toBeDefined();
    const statuses: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      statuses.push((await post({ subject: SUBJECT_A })).status);
    }
    expect(statuses).toStrictEqual([200, 200, 200, 200, 200, 200, 429]);
  });
});
