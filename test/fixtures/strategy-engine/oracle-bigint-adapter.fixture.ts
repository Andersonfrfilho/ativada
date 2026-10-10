// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  RunParameters,
  WalletStepResult,
} from '../../../packages/strategy-engine/src/index.js';
import type { RecordedStep } from './engine-contract-types.fixture.js';
import {
  findOracleDeviation,
  type OracleParameters,
  type OracleStep,
} from './oracle-bigint/oracle-ledger.fixture.js';
import type { RecordedWalletStep } from './wallet/wallet-differential.fixture.js';

function toOracleParameters(parameters: RunParameters): OracleParameters {
  const { initialBalance, feeRate, slippageRate, tickSize } = parameters;
  return { initialBalance, feeRate, slippageRate, tickSize };
}

function toOracleStep(params: {
  readonly candle: { readonly close: string; readonly low: string };
  readonly decisions: WalletStepResult['decisions'];
  readonly cash: string;
}): OracleStep {
  const { candle, decisions } = params;
  return {
    close: candle.close,
    low: candle.low,
    fills: decisions.fills,
    closed: decisions.closedPositions,
    reportedCash: params.cash,
    point: decisions.equityPoint,
  };
}

// Execução do motor (harness): o que ele emitiu em cada passo, sem nada da implementação dele.
export function oracleStepsOfEngineRun(run: readonly RecordedStep[]): OracleStep[] {
  return run.map((step) =>
    toOracleStep({
      candle: step.candle,
      decisions: step.result.decisions,
      cash: step.result.state.wallet.cash,
    }),
  );
}

export function oracleStepsOfWalletFlow(run: readonly RecordedWalletStep[]): OracleStep[] {
  return run.map((step) =>
    toOracleStep({
      candle: step.step.candle,
      decisions: step.result.decisions,
      cash: step.result.state.cash,
    }),
  );
}

export function deviationOfEngineRun(
  parameters: RunParameters,
  run: readonly RecordedStep[],
): string | undefined {
  return findOracleDeviation(toOracleParameters(parameters), oracleStepsOfEngineRun(run));
}

export function deviationOfWalletFlow(
  parameters: RunParameters,
  run: readonly RecordedWalletStep[],
): string | undefined {
  return findOracleDeviation(toOracleParameters(parameters), oracleStepsOfWalletFlow(run));
}
