// Copyright (c) 2026 Ada Technology. All rights reserved.
import { addUtcMonths } from './utc-calendar.js';
import {
  DEFAULT_STEP_MONTHS,
  DEFAULT_TEST_MONTHS,
  DEFAULT_TRAIN_MONTHS,
  MAX_PLANNED_WINDOWS,
  MAX_WINDOW_MONTHS,
  MIN_WALK_FORWARD_WINDOWS,
  WALK_FORWARD_ERROR_CODE,
} from './walk-forward.constant.js';
import { WalkForwardError } from './walk-forward.error.js';
import type { PlanWalkForwardWindowsParams, WalkForwardWindow } from './walk-forward.types.js';

type ResolvedPlan = {
  readonly start: number;
  readonly end: number;
  readonly trainMonths: number;
  readonly testMonths: number;
  readonly stepMonths: number;
  readonly leadInMilliseconds: number;
};

function refuse(message: string): never {
  throw new WalkForwardError({ code: WALK_FORWARD_ERROR_CODE.INVALID_WINDOW_CONFIG, message });
}

function isMonthCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_WINDOW_MONTHS;
}

function resolvePlan(params: PlanWalkForwardWindowsParams): ResolvedPlan {
  const trainMonths = params.trainMonths ?? DEFAULT_TRAIN_MONTHS;
  const testMonths = params.testMonths ?? DEFAULT_TEST_MONTHS;
  const stepMonths = params.stepMonths ?? DEFAULT_STEP_MONTHS;
  if (!Number.isSafeInteger(params.start) || !Number.isSafeInteger(params.end)) {
    refuse('O período precisa ser dois instantes inteiros em milissegundos.');
  }
  if (params.end <= params.start) refuse('O fim do período precisa ser depois do começo.');
  if (![trainMonths, testMonths, stepMonths].every(isMonthCount)) {
    refuse(`Ajuste, teste e passo são meses inteiros de 1 a ${MAX_WINDOW_MONTHS}.`);
  }
  // Passo menor que o teste faria uma janela de teste sobrepor a seguinte: o mesmo candle contado duas vezes.
  if (stepMonths < testMonths)
    refuse('O passo não pode ser menor que o teste (testes sobrepostos).');
  const leadInCandles = params.leadInCandles ?? 0;
  const candleMilliseconds = params.candleMilliseconds ?? 0;
  if (!Number.isSafeInteger(leadInCandles) || leadInCandles < 0) refuse('Aquecimento inválido.');
  if (!Number.isSafeInteger(candleMilliseconds) || candleMilliseconds < 0)
    refuse('Candle inválido.');
  return {
    start: params.start,
    end: params.end,
    trainMonths,
    testMonths,
    stepMonths,
    leadInMilliseconds: leadInCandles * candleMilliseconds,
  };
}

// Todas as fronteiras partem do começo do período (e não da fronteira anterior): o ajuste de um dia 31 não
// acumula o arredondamento para o fim do mês.
function buildWindow(plan: ResolvedPlan, index: number): WalkForwardWindow {
  const offset = index * plan.stepMonths;
  const trainStart = addUtcMonths(plan.start, offset);
  const testStart = addUtcMonths(plan.start, offset + plan.trainMonths);
  return {
    index,
    trainStart,
    trainEnd: testStart,
    testStart,
    testEnd: addUtcMonths(plan.start, offset + plan.trainMonths + plan.testMonths),
    trainLeadInStart: trainStart - plan.leadInMilliseconds,
    testLeadInStart: testStart - plan.leadInMilliseconds,
  };
}

// Janelas móveis de ajuste e teste (RF08), em meses de calendário UTC e em ordem determinística: o teste
// começa exatamente onde o ajuste termina, as janelas de teste nunca se sobrepõem e o último teste cabe
// no período. Menos de três janelas é erro tipado: não há o que concluir sobre a estabilidade.
export function planWalkForwardWindows(
  params: PlanWalkForwardWindowsParams,
): readonly WalkForwardWindow[] {
  const plan = resolvePlan(params);
  const windows: WalkForwardWindow[] = [];
  for (let index = 0; index < MAX_PLANNED_WINDOWS; index += 1) {
    const window = buildWindow(plan, index);
    if (window.testEnd > plan.end) break;
    windows.push(window);
  }
  if (windows.length < MIN_WALK_FORWARD_WINDOWS) {
    throw new WalkForwardError({
      code: WALK_FORWARD_ERROR_CODE.PERIOD_TOO_SHORT,
      message: `O período comporta ${windows.length} janela(s); o walk-forward exige ao menos ${MIN_WALK_FORWARD_WINDOWS}.`,
      details: { windows: windows.length, requiredWindows: MIN_WALK_FORWARD_WINDOWS },
    });
  }
  return windows;
}
