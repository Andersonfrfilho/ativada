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

## T1.1 — Regra `projection-1`, frases e Wilson (2026-10-15)

Modelo: `sonnet` (a recomendação era `haiku`; executado junto com o resto da Fase 1). Sem migration e sem mudança em
`packages/strategy-engine` ou `packages/run-recording`.

- **Pacote novo `@ativada/statistics`** (`packages/statistics/`, P10): `wilson-interval.ts` exporta `WILSON_Z_SQUARED`
  (`2401/625`), `COIN_FLIP_MINIMUM_COUNTED` (30), `COIN_FLIP_VERDICT`, `computeWilsonInterval` (inferior para baixo e
  superior para cima na 12ª casa, presos a `[0, 1]`; contagem inválida lança `RangeError`) e `judgeAgainstCoinFlip` (o
  veredito é a desigualdade inteira exata em `bigint`, não os limites exibidos). Depende só de `@ativada/strategy-engine`
  (para o `EngineDecimal`). A spec 007 importa daqui. O `bun.lock` ganhou só as 3 linhas do pacote novo e a dependência
  no `apps/api-ativada`; `bun install --frozen-lockfile` no espelho com o lockfile do repo: "no changes".
- **`apps/api-ativada/src/runs/projections/`**: `projections.constant.ts` (versão, vocabulários, tetos),
  `projection-rule.ts` (puro: lado, limiar do lado, força sem divisão, postura, faixa que nunca encolhe, acerto, variação
  a 4 casas para baixo, taxa a 4 casas para baixo) e `projection-messages.ts` (catálogo fechado de P9; o acerto em
  porcentagem ao lado dos 50%).
- **Contratos** (`test/wilson-interval`, `projection-rule`, `projection-messages`): contas à mão nas bordas (29/29 =
  `too_few`, 30/30 = `above`, 21 de 30 é o primeiro `above` com inferior 0,5212, 9 de 30 o primeiro `below`, 171 de 346
  `even`), veredito igual ao oráculo `bigint` em todas as contagens até 400, limites exibidos coerentes com o veredito de 30
  a 150, 2.000 sorteios (faixa nunca encolhe, força e taxa iguais às do oráculo, taxa nunca acima da fração exata) e as
  frases literais de P9.

Gates (WSL, espelho `~/gates/ativada-spec9`): `typecheck`, `lint` e `format:check` limpos; 131 testes passam (os 3 novos e
os vizinhos: oráculo, `code-size-limits`, `app-import-boundary`, `strategy-engine-boundary`, `ownership-registry`,
`database.contract`, `test-support-boundary`).

## T1.2 — Leituras das camadas e das previsões no banco (2026-10-15)

Modelo: `sonnet`. Sem migration e sem índice novo (os três já usados são os do ADR, P-medição da T0.1).

- **`packages/database/src/run-results/run-projections.ts`** (+ `run-projections.types.ts`, `run-projection-summary.ts`,
  `run-projection-items.ts`, `run-projection-sql.ts`): `createRunProjectionRepository` com `listLayerRows`,
  `summarizeProjections` e `listProjectionItems`, todas com `OwnerScope` no tipo e o filtro de dono nelas mesmas.
  `summarizeProjections` é UMA consulta (`LEAD` sobre a faixa de velas, vela seguinte exigida contígua e antes do fim da
  faixa, junção com os `signals` do dono, `count(*) FILTER`, comparação em `numeric`, faixa de ±ATR com a borda de baixo
  para baixo e a de cima para cima a 8 casas); os trechos de limiar viajam como UM parâmetro (`jsonb_to_recordset`), sem
  `sql.raw`. `listProjectionItems` lê por cursor (`candle_time` decrescente, `LIMIT + 1`), com o fechamento da vela e da
  seguinte por igualdade na PK; só entram as velas dos trechos pedidos (no walk-forward, as janelas de teste que
  terminaram bem: a janela parada fica fora, o chamador é quem monta os trechos). O banco não importa o motor.
- **Checks no Postgres real** (`packages/database/test-support/run-projection-checks.ts`, ligado ao `database-test` e ao
  `route-isolation-test`, que é o que o `api-runs-mutants` roda): o resumo SQL é IGUAL ao oráculo e ao dourado nos dois
  conjuntos reais × Placar clássico e Donchian + MACD (velas e sinais gravados como o backtest grava, o motor roda o
  `signalStep` de verdade); as páginas de itens batem com o oráculo (vela, ATR e fechamento seguinte); cenário sintético
  com lacuna de vela e fim da faixa (pendentes), empate, dois limiares por trecho e trecho parado fora, igual ao oráculo;
  páginas de 7 concatenadas = lista inteira decrescente; dono alheio recebe contagens zeradas e listas vazias nas três
  leituras. O fixture `test/fixtures/projections/projection-dataset.fixture.ts` passou a ser a fonte única das previsões
  do oráculo (o contrato do oráculo da T0.1 o importa; os números do dourado não mudaram).
- **Desvio de ambiente.** `make database-test` sobe o Docker de teste; aqui rodou o MESMO script
  (`bun run --cwd packages/database db:database-test`) contra o Postgres embutido do WSL (`~/pg-scratch/data-009`, porta
  56437, fora do repo, Postgres 18): "database-test: OK" em 23 s, com os checks novos. Os containers `ativada-dev-*` não
  foram tocados.

Gates (WSL, espelho `~/gates/ativada-spec9`): `typecheck`, `lint` e `format:check` limpos; `database-test` OK;
`route-isolation-test` OK; 102 testes vizinhos passam (oráculo, `database.contract`, `ownership-registry`,
`code-size-limits`, `app-import-boundary`, `strategy-engine-boundary`, `test-support-boundary`).
