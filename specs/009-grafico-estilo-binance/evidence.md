# Evidência — Spec 009

## Respostas do usuário às decisões do spec.md §9 (registro de 2026-10-15)

O usuário (Anderson) respondeu "pode seguir" à mensagem que listava as escolhas recomendadas, incluindo a instalação
de `lightweight-charts`. Valem: D1-A (biblioteca `lightweight-charts`, instalação autorizada), D2-A (previsões
derivadas, sem migration; a tabela `projections` só com nova autorização), D3-A (vela em formação repassada pela API),
D4-A (meio-cone colorido com linha plana), D5-A (pontinhos e níveis da 008 T3.4 ficam nesta spec), D6-A (fraco/forte/decidiu).
O usuário também pediu mostrar o acerto em porcentagem ("acertou 49%") ao lado da referência de 50%.

## T0.1 — Contrato, regra `projection-1`, consulta do resumo e Wilson (2026-10-15)

Modelo: `opus` (task 🧠). Seção nova "Gráfico estilo Binance (spec 009)" no ADR 0002 (P1 a P11, oráculo, dourado e contratos
esperados das Fases 1 a 3). Sem migration e sem índice novo.

- **Índices conferidos no plano de execução** (Postgres 18.6 descartável, container próprio `ativada-spec9-bench-postgres`
  removido no fim; os containers `ativada-dev-*` não foram tocados): `signals_user_id_run_id_idx` (todas as linhas da
  execução), `candles_exchange_symbol_timeframe_open_time_pk` (varredura de faixa do `LEAD`) e
  `signals_run_id_candle_time_unique` (página de camadas). Não falta índice.
- **p95 no volume real** (`bun run packages/database/test-support/projection-summary-benchmark.ts`, 543.120 sinais de 31
  execuções, 140.160 velas de 15 min, a execução medida com 17.520 sinais; 200 rodadas, cliente no WSL):

| Consulta | 1 janela (backtest/ao vivo) | 6 janelas (walk-forward) |
|---|---|---|
| Resumo pelo `LEAD` (escolhida, P6) | p50 86 ms · **p95 101 a 125 ms** | p50 95 ms · **p95 135 a 146 ms** |
| Resumo por igualdade na PK (descartada) | p95 155 a 183 ms | p95 152 a 242 ms |
| Página de camadas (1.000 linhas de `signals`) | p95 3 ms (441 KB em linhas cruas → formato em colunas, P1) | — |

  Faixas = três execuções do script. Abaixo de 300 ms em todos os casos: nenhuma parada.
- **Oráculo e dourado**: `test/fixtures/projections/projection-summary-oracle.fixture.ts` (só `bigint`, sem `src`) e
  `projection-summary-golden.fixture.ts`; os números dos dois conjuntos reais × Placar clássico e Donchian + MACD estão na
  tabela do ADR (todos `even`; acerto de 43,75% a 48,64%; ~87% dentro da faixa).
- **Wilson**: lugar único decidido em `packages/statistics/src/wilson-interval.ts` (P10; a spec 007 importa ou cria lá; os
  arquivos dela não foram tocados). O veredito é a desigualdade inteira exata (P5), igual no oráculo.
- **Desvios do plan registrados no ADR**: teto de `strategy-layers` de 5.000 → **1.000 velas** e resposta em colunas (P1,
  payload ≤ 250 KB); janela parada do walk-forward fora das previsões (P4); vela seguinte exigida contígua, com `gap` além de
  `pending` (P3); `live-status` não ganha `projection` (P8); taxas a 4 casas (= 2 em %) e o acerto em porcentagem na frase do
  resumo, como o usuário pediu (P9).

Gates (WSL, espelho `~/gates/ativada-spec9`): `bun run typecheck` ok; `bun run lint` ok; `bun run format:check` ok;
`bun test test/projection-summary-oracle.contract.test.ts` 9 pass, 0 fail (33 `expect`).
