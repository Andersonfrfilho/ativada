// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  COMMAND_KIND,
  COMMAND_REASON,
  computeOpenPositionMetrics,
  createInitialWalletState,
  type ClosedPositionDecision,
  type Engine,
  type EngineCommand,
  type OpenPositionMetrics,
  type RunSetup,
  type SignalDecision,
  type StrategyVersion,
  type WalletDecisions,
} from '@cryptoada/strategy-engine';

import type { CandleSeries } from './candle-series.js';
import type { SignalSeries } from './signal-series.js';
import { PARKED_COMMAND_PREFIX, WINDOW_END_COMMAND_PREFIX } from './walk-forward.constant.js';
import type { WalletSpan } from './window-spans.js';

// Quem recebe o que a carteira decidiu em cada candle (o ajuste só guarda patrimônio e operações; o teste grava
// tudo).
export type WalletCollector = (decisions: WalletDecisions, signal: SignalDecision | null) => void;

export type RunWindowWalletParams = {
  readonly engine: Engine;
  readonly series: CandleSeries;
  readonly signals: SignalSeries;
  readonly strategy: StrategyVersion;
  readonly setup: RunSetup;
  readonly span: WalletSpan;
  // Espaço de nome das chaves da carteira (`w<índice>:`): nenhuma colisão entre janelas.
  readonly keyPrefix: string;
  // Carteira PARADA (janela sem parâmetro elegível): nenhuma entrada, só a régua e o patrimônio parado.
  readonly isParked: boolean;
  readonly collect: WalletCollector;
};

export type WalletRunSummary = {
  readonly openPosition: OpenPositionMetrics | null;
  readonly lastClose: string;
};

function halt(prefix: string, name: string, closeTime: number): EngineCommand {
  return {
    commandId: `${prefix}${name}`,
    issuedAt: closeTime,
    kind: COMMAND_KIND.HALT,
    reason: COMMAND_REASON.WINDOW_END,
  };
}

// `halt` no último candle da janela impede entrada nova (ela executaria fora do período); a carteira parada
// recebe o seu no candle-âncora.
function commandsFor(params: {
  readonly index: number;
  readonly span: WalletSpan;
  readonly prefix: string;
  readonly isParked: boolean;
  readonly closeTime: number;
}): EngineCommand[] {
  const commands: EngineCommand[] = [];
  if (params.isParked && params.index === params.span.anchorIndex) {
    commands.push(halt(params.prefix, PARKED_COMMAND_PREFIX, params.closeTime));
  }
  if (params.index === params.span.limitIndex - 1) {
    commands.push(halt(params.prefix, WINDOW_END_COMMAND_PREFIX, params.closeTime));
  }
  return commands;
}

// Uma carteira nova sobre sinais já calculados: o `walletStep` avulso confere hashes, ordem e contiguidade.
export function runWindowWallet(params: RunWindowWalletParams): WalletRunSummary {
  const { engine, series, strategy, setup, span } = params;
  let state = createInitialWalletState({ strategy, run: setup, keyPrefix: params.keyPrefix });
  let lastClose = setup.parameters.initialBalance;
  for (let index = span.anchorIndex; index < span.limitIndex; index += 1) {
    const candle = series.candles[index];
    if (candle === undefined) break;
    const signal = params.signals.at(index);
    const result = engine.walletStep({
      strategy,
      run: setup,
      state,
      candle,
      signal,
      commands: commandsFor({
        index,
        span,
        prefix: params.keyPrefix,
        isParked: params.isParked,
        closeTime: candle.closeTime,
      }),
    });
    state = result.state;
    lastClose = candle.close;
    params.collect(result.decisions, signal);
  }
  return {
    openPosition: computeOpenPositionMetrics({
      wallet: state,
      lastClose,
      parameters: setup.parameters,
    }),
    lastClose,
  };
}

export type ClosedTrade = ClosedPositionDecision;
