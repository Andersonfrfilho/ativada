// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertCandleAfter,
  assertCandleSequence,
  assertCandleShape,
  refuse,
} from './assert-candle.js';
import { assertRunHash, assertStrategyHash } from './assert-hashes.js';
import type { EngineCandle, SentimentObservation } from './engine-candle.types.js';
import { SENTIMENT_MAXIMUM_VALUE } from './engine.constant.js';
import type { EngineCommand, SignalStepInput, StepInput, WalletStepInput } from './engine.types.js';
import { COMMAND_KIND, COMMAND_REASON } from './engine-vocabulary.constant.js';
import {
  ENGINE_INPUT_ERROR_CODE,
  ENGINE_STATE_ERROR_CODE,
  EngineStateError,
} from './strategy-engine.error.js';

export type AssertStepInputParams = {
  readonly input: StepInput;
  readonly engineVersion: string;
};

const MAX_IDENTIFIER_LENGTH = 64;
const COMMAND_KINDS: readonly string[] = Object.values(COMMAND_KIND);
const COMMAND_REASONS: readonly string[] = Object.values(COMMAND_REASON);

function isIdentifier(value: string): boolean {
  return value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH;
}

// Inteiro 0..100 e finito (NaN não passa); `observedAt` nunca depois do fechamento (lookahead).
function assertSentiment(sentiment: SentimentObservation, candle: EngineCandle): void {
  const isValid =
    Number.isInteger(sentiment.value) &&
    sentiment.value >= 0 &&
    sentiment.value <= SENTIMENT_MAXIMUM_VALUE &&
    Number.isSafeInteger(sentiment.observedAt) &&
    sentiment.observedAt >= 0 &&
    typeof sentiment.source === 'string' &&
    isIdentifier(sentiment.source);
  if (!isValid) refuse(ENGINE_INPUT_ERROR_CODE.SENTIMENT_INVALID, 'Sentimento inválido.');
  if (sentiment.observedAt > candle.closeTime) {
    refuse(
      ENGINE_INPUT_ERROR_CODE.SENTIMENT_FROM_FUTURE,
      'Sentimento disponível só depois do fechamento.',
    );
  }
}

function isValidCommand(command: EngineCommand, candle: EngineCandle): boolean {
  return (
    isIdentifier(command.commandId) &&
    Number.isSafeInteger(command.issuedAt) &&
    command.issuedAt >= 0 &&
    command.issuedAt <= candle.closeTime &&
    COMMAND_KINDS.includes(command.kind) &&
    COMMAND_REASONS.includes(command.reason)
  );
}

export function assertCommands(commands: readonly EngineCommand[], candle: EngineCandle): void {
  const identifiers = new Set(commands.map((command) => command.commandId));
  const isValid =
    identifiers.size === commands.length &&
    commands.every((command) => isValidCommand(command, candle));
  if (!isValid) refuse(ENGINE_INPUT_ERROR_CODE.COMMAND_INVALID, 'Comando inválido ou repetido.');
}

export function assertSignalStepInput(input: SignalStepInput): void {
  assertCandleShape(input.candle, input.market);
  assertCandleSequence({
    candle: input.candle,
    lastCandleOpenTime: input.state.lastCandleOpenTime,
    market: input.market,
    confirmedGapCandles: input.confirmedGapCandles,
  });
  if (input.sentiment !== undefined) assertSentiment(input.sentiment, input.candle);
}

export function assertWalletStepInput(input: WalletStepInput): void {
  assertCandleShape(input.candle, input.run.parameters);
  assertCandleAfter(input.candle, input.state.lastCandleOpenTime);
  if (input.signal !== null && input.signal.candleOpenTime !== input.candle.openTime) {
    refuse(ENGINE_INPUT_ERROR_CODE.SIGNAL_MISMATCH, 'Sinal de outro candle.');
  }
  assertCommands(input.commands ?? [], input.candle);
}

// Guarda do passo inteiro: motor, versão da estratégia e parâmetros da execução antes do candle.
export function assertStepInput(params: AssertStepInputParams): void {
  const { input, engineVersion } = params;
  if (input.state.engineVersion !== engineVersion) {
    throw new EngineStateError({
      code: ENGINE_STATE_ERROR_CODE.ENGINE_MISMATCH,
      message: 'Estado gravado por outra versão do motor; replique desde o início.',
    });
  }
  if (input.state.configHash !== input.strategy.configHash) {
    refuse(ENGINE_INPUT_ERROR_CODE.CONFIG_HASH_MISMATCH, 'Estado de outra versão da estratégia.');
  }
  if (input.state.runHash !== input.run.runHash) {
    refuse(ENGINE_INPUT_ERROR_CODE.RUN_HASH_MISMATCH, 'Estado de outros parâmetros de execução.');
  }
  assertStrategyHash(input.strategy);
  assertRunHash(input.run);
  // As duas metades andam juntas: um estado em que cada uma parou num candle não é retomável.
  if (input.state.signal.lastCandleOpenTime !== input.state.wallet.lastCandleOpenTime) {
    throw new EngineStateError({
      code: ENGINE_STATE_ERROR_CODE.INVALID_STATE,
      message: 'Carteira e sinal em candles diferentes.',
    });
  }
  assertSignalStepInput({ ...input, market: input.run.parameters, state: input.state.signal });
  assertCommands(input.commands ?? [], input.candle);
}
