// Copyright (c) 2026 Ada Technology. All rights reserved.
import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { parseEnvironment } from '../packages/environment/src/index.js';
import { environmentSchema } from '../apps/api-ativada/src/environment.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

// Pergunta por voz: o motor local é opt-in e, ligado, exige o binário e o modelo; `~/` vira a pasta do usuário.

type Source = Record<string, string>;

async function parseWith(overrides: Source): Promise<Record<string, unknown>> {
  const base = await readEnvironmentFile('env.test');
  return parseEnvironment(environmentSchema, { ...base, ...overrides });
}

async function rejectionOf(overrides: Source): Promise<string> {
  try {
    await parseWith(overrides);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('o ambiente deveria ter sido recusado');
}

describe('TRANSCRIPTION_ENGINE', () => {
  test('é off quando omitido, sem exigir caminho', async () => {
    const parsed = await parseWith({});
    expect(parsed['TRANSCRIPTION_ENGINE']).toBe('off');
    expect(parsed['WHISPER_MODEL_PATH']).toBeUndefined();
  });

  test('whisper_local sem binário ou modelo reprova o boot, nomeando a variável', async () => {
    const message = await rejectionOf({ TRANSCRIPTION_ENGINE: 'whisper_local' });
    expect(message).toContain('WHISPER_CLI_PATH');
    expect(message).toContain('WHISPER_MODEL_PATH');
  });

  test('whisper_local com os dois caminhos: `~/` expandido, absoluto intacto, threads opcionais', async () => {
    const parsed = await parseWith({
      TRANSCRIPTION_ENGINE: 'whisper_local',
      WHISPER_CLI_PATH: '~/.local/bin/whisper-cli',
      WHISPER_MODEL_PATH: '/models/ggml-large-v3-turbo.bin',
      WHISPER_THREADS: '4',
    });
    expect(parsed['WHISPER_CLI_PATH']).toBe(join(homedir(), '.local/bin/whisper-cli'));
    expect(parsed['WHISPER_MODEL_PATH']).toBe('/models/ggml-large-v3-turbo.bin');
    expect(parsed['WHISPER_THREADS']).toBe(4);
  });

  test('motor desconhecido, caminho relativo e threads fora da faixa reprovam', async () => {
    for (const overrides of [
      { TRANSCRIPTION_ENGINE: 'groq' },
      { WHISPER_MODEL_PATH: 'models/ggml.bin' },
      { WHISPER_THREADS: '0' },
    ]) {
      expect(await rejectionOf(overrides)).not.toBe('');
    }
  });
});
