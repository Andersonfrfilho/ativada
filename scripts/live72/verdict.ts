// Copyright (c) 2026 Ada Technology. All rights reserved.
import { VERDICT, type Verdict } from './live72.constant.js';

export type VerdictInput = {
  readonly isWindowComplete: boolean;
  readonly runStatus: string;
  readonly runErrorCode: string | null;
  readonly endedEarly: boolean;
  readonly interventionCount: number;
  readonly duplicateTotal: number;
  readonly missingCandles: number;
  readonly isKillFired: boolean;
  readonly evaluatedAfterKill: number | null;
  readonly isKillResumeDue: boolean;
  readonly shrunkAfterKill: readonly string[];
  readonly actionableSignals: number;
  readonly alertsGenerated: number;
};

export type VerdictResult = { readonly verdict: Verdict; readonly reasons: readonly string[] };

const FAILED_STATUS = 'failed';

function findFailures(input: VerdictInput): string[] {
  const failures: string[] = [];
  if (input.runStatus === FAILED_STATUS || input.runErrorCode !== null) {
    failures.push(
      `a execução falhou (status ${input.runStatus}, código ${input.runErrorCode ?? 'nenhum'})`,
    );
  }
  if (input.duplicateTotal > 0) {
    failures.push(`${input.duplicateTotal} chave(s) duplicada(s) no banco`);
  }
  if (input.missingCandles > 0)
    failures.push(`${input.missingCandles} candle(s) sem avaliação (buraco)`);
  if (input.shrunkAfterKill.length > 0) {
    failures.push(`contagem menor depois do reinício: ${input.shrunkAfterKill.join(', ')}`);
  }
  if (input.isKillFired && input.isKillResumeDue && input.evaluatedAfterKill === 0) {
    failures.push('o worker não retomou a avaliação depois do reinício controlado');
  }
  if (input.actionableSignals > 0 && input.alertsGenerated === 0) {
    failures.push(
      `${input.actionableSignals} sinal(is) BUY/SELL de candles da janela sem nenhum alerta gerado`,
    );
  }
  return failures;
}

function findGaps(input: VerdictInput): string[] {
  const gaps: string[] = [];
  if (!input.isWindowComplete) gaps.push('as 72 h ainda não se completaram');
  if (input.endedEarly) gaps.push('a execução terminou antes das 72 h (meta ou parada)');
  if (input.interventionCount > 0) {
    gaps.push(
      `${input.interventionCount} comando(s) humano(s) fora do supervisor durante a execução`,
    );
  }
  if (!input.isKillFired) gaps.push('o reinício controlado do worker não aconteceu');
  if (input.actionableSignals === 0) {
    gaps.push(
      'nenhum sinal BUY/SELL em candle fechado dentro da janela: a geração de alertas não foi exercitada',
    );
  }
  return gaps;
}

export function decideVerdict(input: VerdictInput): VerdictResult {
  const failures = findFailures(input);
  if (failures.length > 0) return { verdict: VERDICT.FAILED, reasons: failures };
  const gaps = findGaps(input);
  if (gaps.length > 0) return { verdict: VERDICT.INCONCLUSIVE, reasons: gaps };
  return {
    verdict: VERDICT.APPROVED,
    reasons: [
      '72 h completas, reinício controlado retomado sem duplicar, sem buraco e com alertas',
    ],
  };
}
