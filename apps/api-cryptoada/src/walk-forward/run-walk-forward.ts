// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describeFailure } from './describe-failure.js';
import { executeWalkForward } from './execute-walk-forward.js';
import { WALK_FORWARD_ERROR_CODE, WALK_FORWARD_OUTCOME_STATUS } from './walk-forward.constant.js';
import type { RunWalkForwardParams, WalkForwardOutcome } from './walk-forward.types.js';
import type { WalkForwardDatabase, WalkForwardRunSession } from './walk-forward-database.types.js';

async function recordFailure(session: WalkForwardRunSession, errorCode: string): Promise<boolean> {
  try {
    return await session.failRun(errorCode);
  } catch {
    return false;
  }
}

// O caso de uso do walk-forward (RF08): resolve o dono pelo `runId`, busca a grade nas janelas de ajuste, testa
// janela a janela e fecha a execução com o relatório fora da amostra. NUNCA deixa a execução `running` por causa de
// um erro: qualquer falha vira `failed` com código estável, e o que as janelas anteriores gravaram fica.
export async function runWalkForward(params: RunWalkForwardParams): Promise<WalkForwardOutcome> {
  const { database, runId } = params;
  const session = await database.attach(runId);
  if (session === undefined) {
    return {
      status: WALK_FORWARD_OUTCOME_STATUS.FAILED,
      runId,
      errorCode: WALK_FORWARD_ERROR_CODE.RUN_NOT_FOUND,
      message: 'A execução não existe ou o dono dela não está ativo.',
      isRecorded: false,
    };
  }
  try {
    return await executeWalkForward({ session, runId, options: params.options });
  } catch (error: unknown) {
    const failure = describeFailure(error);
    return {
      status: WALK_FORWARD_OUTCOME_STATUS.FAILED,
      runId,
      ...failure,
      isRecorded: await recordFailure(session, failure.errorCode),
    };
  }
}

// A thread principal marca a execução quando a thread do walk-forward morreu ou estourou o tempo.
export async function failWalkForwardRun(params: {
  readonly database: WalkForwardDatabase;
  readonly runId: string;
  readonly errorCode: string;
}): Promise<boolean> {
  const session = await params.database.attach(params.runId);
  return session === undefined ? false : recordFailure(session, params.errorCode);
}
