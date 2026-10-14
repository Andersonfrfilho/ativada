// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MutantTarget } from '../walk-forward/walk-forward-mutation.fixture.js';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url).pathname;

// As rotas REST (T3.4): a cópia leva o `src` INTEIRO da API, porque o roteador, os erros e o envelope têm de vir da
// mesma raiz que as rotas; os contratos de rota a carregam por `API_ROUTES_APP_SOURCE`.
export const API_ROUTES_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'api-routes-',
  judgeTestFiles: [
    'test/api-markets.contract.test.ts',
    'test/api-strategies.contract.test.ts',
    'test/api-runs.contract.test.ts',
    'test/api-run-series.contract.test.ts',
    'test/api-run-series-order.contract.test.ts',
    'test/api-strategy-delete.contract.test.ts',
    'test/api-sentiment.contract.test.ts',
    'test/api-price-alerts-clear-fired.contract.test.ts',
    'test/api-cursor-instant.contract.test.ts',
    'test/api-run-export.contract.test.ts',
    'test/api-run-log-export.contract.test.ts',
    'test/api-openapi.contract.test.ts',
    'test/api-docs-page.contract.test.ts',
    'test/api-run-queue-dispatcher.contract.test.ts',
    'test/api-application-dispatcher.contract.test.ts',
    'test/api-run-admission.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// A semeadura da estratégia de exemplo (T3.5): o mesmo `src` da API, julgado só pelo contrato dela.
export const EXAMPLE_STRATEGY_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'example-',
  judgeTestFiles: ['test/example-strategy.contract.test.ts'],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// A fila durável de execuções (T3.6): o despachante e os tetos de criação, julgados só pelos contratos deles.
export const RUN_QUEUE_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'run-queue-',
  judgeTestFiles: [
    'test/api-run-queue-dispatcher.contract.test.ts',
    'test/api-application-dispatcher.contract.test.ts',
    'test/api-run-admission.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

export const GOALS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'goals-',
  judgeTestFiles: [
    'test/api-goals.contract.test.ts',
    'test/api-goal-evaluation.contract.test.ts',
    'test/api-goal-runs.contract.test.ts',
    'test/api-goal-plan.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// Os alertas de preço (T4b.6, RF14): as rotas, a validação e os casos de uso, julgados só pelo contrato deles.
export const PRICE_ALERTS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'price-alerts-',
  judgeTestFiles: [
    'test/api-price-alerts.contract.test.ts',
    'test/price-alert-evaluation.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// Os ativos do usuário (T4b.8, RF15): posição, rotas, resumo e regra do dia, julgados só pelos contratos deles.
export const ASSETS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'assets-',
  judgeTestFiles: [
    'test/asset-position.contract.test.ts',
    'test/asset-rule.contract.test.ts',
    'test/api-assets.contract.test.ts',
    'test/api-assets-summary.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// Os filtros de preço e quantidade por par (T0.2 da spec 003): a API que os aplica, julgada só pelos contratos deles.
export const SYMBOL_FILTERS_API_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'symbol-filters-',
  judgeTestFiles: [
    'test/api-run-symbol-filters.contract.test.ts',
    'test/goal-evaluation-series-filters.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// A tabela e a checagem do boot moram no pacote de dados de mercado: a cópia leva o `src` dele.
export const SYMBOL_FILTERS_PACKAGE_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}packages/market-data-crypto/src`,
  mutantRoot: `${REPOSITORY_ROOT}packages/market-data-crypto/.mutants`,
  directoryPrefix: 'symbol-filters-',
  judgeTestFiles: ['test/symbol-filters.contract.test.ts'],
  sourceVariable: 'SYMBOL_FILTERS_SOURCE',
};

// O comparador de prazos (spec 003, Fase 2): o cache, o portão a frio, a escolha da melhor estratégia por linha e, nas tasks
// seguintes, a rota e a linha de 15 minutos, julgados só pelos contratos deles.
export const HORIZONS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'horizons-',
  judgeTestFiles: [
    'test/horizon-evaluation.contract.test.ts',
    'test/horizon-best.contract.test.ts',
    'test/horizon-messages.contract.test.ts',
    'test/horizon-view.contract.test.ts',
    'test/horizon-intraday-run.contract.test.ts',
    'test/api-horizons.contract.test.ts',
    'test/api-cold-gate-sharing.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// As três rotas das operações no gráfico (spec 005, T1.5): `/trades` aditivo, `/chart` e `/trade-summary`, julgadas só pelos
// contratos delas (dono, acesso, validação, contas de pago e recebido, arredondamento e a frase).
export const RUN_CHART_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'run-chart-',
  judgeTestFiles: [
    'test/api-run-trades.contract.test.ts',
    'test/api-run-chart.contract.test.ts',
    'test/api-run-trade-summary.contract.test.ts',
    'test/trade-summary-message.contract.test.ts',
    'test/api-run-series.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
};

// A parada da simulação ao vivo (spec 006, Fase 2): a regra, a varredura, o laço e o conteúdo do alerta, julgados só pelos
// contratos deles (e pelo que o despachante do worker aceita do conteúdo).
export const LIVE_STALL_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'live-stall-',
  judgeTestFiles: [
    'test/live-stall-policy.contract.test.ts',
    'test/live-stall-sweeper.contract.test.ts',
    'test/alert-stall.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
  judgeTimeoutMilliseconds: 120_000,
  shouldBailOnFirstFailure: true,
};

// O acompanhamento da simulação ao vivo (spec 008, Fase 1): as contas, as frases, as leituras gravadas, as rotas e as decisões
// do `/chart`, julgados só pelos contratos deles (o primeiro teste que falha basta para matar o mutante).
export const LIVE_STATUS_MUTANT_TARGET: MutantTarget = {
  sourceDirectory: `${REPOSITORY_ROOT}apps/api-ativada/src`,
  mutantRoot: `${REPOSITORY_ROOT}apps/api-ativada/.mutants`,
  directoryPrefix: 'live-status-',
  judgeTestFiles: [
    'test/api-run-live-status.contract.test.ts',
    'test/api-run-chart-decisions.contract.test.ts',
    'test/live-balance.contract.test.ts',
    'test/live-goal-progress.contract.test.ts',
    'test/live-stored-readings.contract.test.ts',
    'test/live-decision-messages.contract.test.ts',
    'test/live-trigger-messages.contract.test.ts',
    'test/live-status-messages.contract.test.ts',
    'test/api-run-chart.contract.test.ts',
    'test/api-openapi.contract.test.ts',
  ],
  sourceVariable: 'API_ROUTES_APP_SOURCE',
  shouldBailOnFirstFailure: true,
};
