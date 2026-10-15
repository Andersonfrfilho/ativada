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

## T0.2 — Spike da biblioteca `lightweight-charts@5.2.1` (2026-10-15)

Modelo: `sonnet` na recomendação; executado nesta sessão (`opus`) junto com a T0.1, a pedido do orquestrador. Instalação
autorizada pelo usuário (D1-A). Decisões P12 a P14 no ADR 0002.

- **Instalação**: `"lightweight-charts": "5.2.1"` (exato) em `apps/frontend-ativada/package.json`; `bun install` rodado
  SÓ no espelho Linux (`~/gates/ativada-spec9`, Bun 1.4.3), nunca em `/mnt/c`; o `node_modules` do Windows não foi tocado.
  O `bun.lock` do repo recebeu só as 3 linhas novas (a dependência no workspace do painel, `fancy-canvas@2.1.0` e
  `lightweight-charts@5.2.1`, com os `sha512`); o bun do espelho reordenava 5 entradas antigas, e essa reordenação ficou de
  fora. `bun install --frozen-lockfile` no espelho com o lockfile do repo: "no changes".
- **Licença**: `lightweight-charts` Apache-2.0 (arquivo `LICENSE`, "Copyright 2023 TradingView, Inc."); `fancy-canvas` MIT.
  O pacote npm **não traz o `NOTICE`**; o da tag `v5.2.1` no GitHub diz "TradingView Lightweight Charts™ / Copyright (с)
  2025 TradingView, Inc. https://www.tradingview.com/". O `README` exige esse aviso e um link para tradingview.com na página
  (P13: rodapé do cartão, T3.1).
- **`bun audit`**: 1 vulnerabilidade moderada já existente (`esbuild` ≤ 0.24.2 por `drizzle-kit` e `vite > tsx`, servidor
  de desenvolvimento); **nenhuma** em `lightweight-charts` nem `fancy-canvas`.
- **CSP sem afrouxar** (spike fora do repo, `vite build` + `vite preview` com `PANEL_CONTENT_SECURITY_POLICY_DIRECTIVES` no
  `<meta>` e `PANEL_SECURITY_HEADERS` no cabeçalho, conferido por `curl`; página com 20.000 velas de 15 min, 3 painéis —
  velas, volume, placar —, linha de canal tracejada, 400 marcadores "Compra"/"Venda" e o cone de uma vela à frente com a
  linha plana; aberta no navegador do app):
  - `attributionLogo: false`: **0 violação** (`securitypolicyviolation`), console vazio, 15 canvas, 3 painéis, nenhum
    `<style>` criado; os 45 elementos com `style` recebem o estilo por CSSOM, que a CSP permite.
  - `attributionLogo: true` (padrão da v5): **4 violações `style-src-elem`** (o `<style>` em linha do logotipo) e o
    logotipo sem posição. Por isso P12: logotipo desligado e crédito no rodapé. **Nenhuma diretiva precisou mudar.**
- **Bundle**: o pedaço do spike (biblioteca com velas, histograma, linha e marcadores + ~1 KB de página) tem **179,6 KB,
  58,4 KB gzip**; o JS do painel hoje tem 670,4 KB, 207,2 KB gzip. Somado ao pedaço principal seria +28%; a T3.1 carrega o
  adaptador por `import()` dinâmico (P14).
- **Desempenho**: o painel de navegador do app ficou oculto (viewport 0, `requestAnimationFrame` parado) e o WSL não tem o
  Chromium do Playwright (baixar exigiria autorização): **quadros/s ao arrastar não foram medidos**. Medida substituta:
  redesenho completo forçado (`chart.takeScreenshot()`, que pinta os 3 painéis e ainda compõe uma imagem) com 5.000 velas
  visíveis, deslocando a faixa a cada passo, 120 vezes: mediana **15,8 ms**, p95 31,3 ms (a primeira, fria, 311 ms). O quadro
  normal não compõe a imagem, então fica abaixo disso. A medida de 60 quadros/s ao arrastar 5.000 velas (RNF02) passa para o
  E2E da T3.8, com o Chromium que o `make panel-e2e` já usa.
- **Porta e superfície falsa** (no repo): `src/runs/candle-chart/chart-surface.types.ts` (a porta `ChartSurface` do plan
  D1), `test/support/fake-chart-surface.ts` e `test/chart-surface.contract.tsx` (na lista do script `test` do painel):
  happy-dom sem canvas, StrictMode monta duas vezes sem deixar superfície viva, eventos e `destroy`, e só o adaptador
  importa a biblioteca.

Gates (WSL, espelho `~/gates/ativada-spec9`): `bun run typecheck` ok; `bun run lint` ok (a primeira rodada reprovou 4
tipos de retorno ausentes nos testes novos; corrigido); `bun run format:check` ok; `bun run --cwd apps/frontend-ativada
test` 795 pass, 0 fail.
