// Copyright (c) 2026 Ada Technology. All rights reserved.
import { BACKTEST_ERROR_CODE, BACKTEST_OUTCOME_STATUS } from './backtest.constant.js';
import type { BacktestOutcome, RunBacktestParams } from './backtest.types.js';
import type { BacktestRunSession } from './backtest-database.types.js';
import { describeFailure } from './describe-failure.js';
import { executeBacktest } from './execute-backtest.js';

async function recordFailure(session: BacktestRunSession, errorCode: string): Promise<boolean> {
  try {
    return await session.failRun(errorCode);
  } catch {
    return false;
  }
}

// O caso de uso do backtest (RF07): resolve o dono pelo `runId`, executa em lotes e fecha a execução. NUNCA
// deixa a execução `running` por causa de um erro: qualquer falha vira `failed` com código estável, e o que os
// lotes anteriores gravaram fica. Cancelamento não é erro.
export async function runBacktest(params: RunBacktestParams): Promise<BacktestOutcome> {
  const { database, runId } = params;
  const session = await database.attach(runId);
  if (session === undefined) {
    return {
      status: BACKTEST_OUTCOME_STATUS.FAILED,
      runId,
      errorCode: BACKTEST_ERROR_CODE.RUN_NOT_FOUND,
      message: 'A execução não existe ou o dono dela não está ativo.',
      isRecorded: false,
    };
  }
  try {
    return await executeBacktest({ session, runId, options: params.options ?? {} });
  } catch (error: unknown) {
    const failure = describeFailure(error);
    return {
      status: BACKTEST_OUTCOME_STATUS.FAILED,
      runId,
      ...failure,
      isRecorded: await recordFailure(session, failure.errorCode),
    };
  }
}

// A thread principal marca a execução quando a thread do backtest morreu ou estourou o tempo (T3.2).
export async function failBacktestRun(params: {
  readonly database: RunBacktestParams['database'];
  readonly runId: string;
  readonly errorCode: string;
}): Promise<boolean> {
  const session = await params.database.attach(params.runId);
  return session === undefined ? false : recordFailure(session, params.errorCode);
}
