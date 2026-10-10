// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cp, rm } from 'node:fs/promises';

import type {
  JsonValue,
  SignalDecision,
  SignalStepInput,
  SignalStepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import { findFirstRuleMismatch } from './rule-cases.fixture.js';
import { findFirstMismatch } from './scoreboard-scenarios.fixture.js';
import { findFirstSelectionMismatch } from './selection-cases.fixture.js';
import type { SignalApi } from './signal-api.fixture.js';
import { buildSignalScenarios } from './signal-contract-scenarios.fixture.js';
import { runSignalContract, SignalContractViolation } from './signal-contract.fixture.js';

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url).pathname;
const SOURCE_DIRECTORY = `${REPOSITORY_ROOT}packages/strategy-engine/src`;
// Dentro do pacote: é de lá que `zod` e `decimal.js` (versões exatas do pacote) se resolvem.
export const MUTANT_ROOT = `${REPOSITORY_ROOT}packages/strategy-engine/.mutants`;

// Uma mutação de `src`: o texto `find` do arquivo vira `replace`, e a cópia mutada do pacote roda as
// mesmas tabelas e o mesmo contrato que o código de produção.
export type SourceMutant = {
  readonly name: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  readonly occurrences?: number;
};

const SIGNAL_API_MEMBERS: readonly string[] = [
  'castRuleVote',
  'computeStrategyLeadInCandles',
  'createStrategySignalState',
  'evaluateScoreboard',
  'formatTruncatedAdx',
  'resolveFamilyWeight',
  'resolveRegime',
  'selectAvailableSentiment',
  'signalStep',
];

function isSignalApi(candidate: unknown): candidate is SignalApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  return SIGNAL_API_MEMBERS.every(
    (member) => typeof Object.getOwnPropertyDescriptor(candidate, member)?.value === 'function',
  );
}

export async function loadMutantApi(mutant: SourceMutant): Promise<SignalApi> {
  const directory = `${MUTANT_ROOT}/${mutant.name.toLowerCase()}`;
  await cp(SOURCE_DIRECTORY, directory, { recursive: true });
  const path = `${directory}/${mutant.file}`;
  const text = await Bun.file(path).text();
  const found = text.split(mutant.find).length - 1;
  const expected = mutant.occurrences ?? 1;
  if (found !== expected) {
    throw new Error(
      `Mutante ${mutant.name}: "${mutant.find}" aparece ${found}x em ${mutant.file}.`,
    );
  }
  await Bun.write(path, text.replaceAll(mutant.find, mutant.replace));
  const loaded: unknown = await import(`${directory}/index.ts`);
  if (!isSignalApi(loaded)) throw new Error(`Mutante ${mutant.name}: módulo sem a API do sinal.`);
  return loaded;
}

export async function removeMutants(): Promise<void> {
  await rm(MUTANT_ROOT, { recursive: true, force: true });
}

const PEEK_KEY = 'mutant:previous';

type Peek = { readonly decision: string; readonly close: number };

type PeekRewriteParams = {
  readonly previous: SignalDecision;
  readonly previousClose: number;
  readonly current: SignalDecision;
  readonly close: number;
};

function readPeek(input: SignalStepInput): { decision: SignalDecision; close: number } | undefined {
  const stored = input.state.indicators[PEEK_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return undefined;
  const { decision, close } = stored as Partial<Peek>;
  if (typeof decision !== 'string' || typeof close !== 'number') return undefined;
  return { decision: JSON.parse(decision) as SignalDecision, close };
}

function writePeek(result: SignalStepResult, input: SignalStepInput): SignalStepResult {
  if (result.signal === null) return result;
  const peek: Peek = { decision: JSON.stringify(result.signal), close: Number(input.candle.close) };
  const indicators: Readonly<Record<string, JsonValue>> = {
    ...result.state.indicators,
    [PEEK_KEY]: peek,
  };
  return { ...result, state: { ...result.state, indicators } };
}

// Motor que espia: no candle `t` devolve a decisão do candle `t-1` refeita com dado de `t` (o estado
// guarda a decisão anterior, então o desvio é visível só pelo futuro). Mesmo defeito do
// `LOOKS_AT_FUTURE` da referência, aplicado ao `signalStep` de produção.
function peekingApi(
  api: SignalApi,
  rewrite: (params: PeekRewriteParams) => SignalDecision,
): SignalApi {
  return {
    ...api,
    signalStep: (input): SignalStepResult => {
      const result = api.signalStep(input);
      const previous = readPeek(input);
      const written = writePeek(result, input);
      if (previous === undefined || result.signal === null) return written;
      const signal = rewrite({
        previous: previous.decision,
        previousClose: previous.close,
        current: result.signal,
        close: Number(input.candle.close),
      });
      return { ...written, signal };
    },
  };
}

export function createVoteLookaheadApi(api: SignalApi): SignalApi {
  return peekingApi(api, (params) => ({
    ...params.previous,
    action: params.close > params.previousClose ? 'BUY' : 'SELL',
  }));
}

export function createRegimeOnFutureAdxApi(api: SignalApi): SignalApi {
  return peekingApi(api, (params) => ({ ...params.previous, regime: params.current.regime }));
}

export type MutantVerdict = { readonly detector: string; readonly detail: string };

function attempt(detector: string, find: () => string | undefined): MutantVerdict | undefined {
  try {
    const mismatch = find();
    return mismatch === undefined ? undefined : { detector, detail: mismatch };
  } catch (error) {
    return { detector, detail: error instanceof Error ? error.message : String(error) };
  }
}

function contractVerdict(api: SignalApi): MutantVerdict | undefined {
  try {
    runSignalContract({ api, scenarios: buildSignalScenarios() });
  } catch (error) {
    if (error instanceof SignalContractViolation) {
      return { detector: `contract:${error.check}`, detail: error.message };
    }
    throw error;
  }
  return undefined;
}

// Quem reprova o mutante primeiro: as tabelas (voto/regime, cenários, seleção) e depois o contrato.
export function judgeMutant(api: SignalApi): MutantVerdict | undefined {
  return (
    attempt('rule-cases', () => findFirstRuleMismatch(api)) ??
    attempt('scoreboard-scenarios', () => findFirstMismatch(api)) ??
    attempt('selection-cases', () => findFirstSelectionMismatch(api)) ??
    contractVerdict(api)
  );
}
