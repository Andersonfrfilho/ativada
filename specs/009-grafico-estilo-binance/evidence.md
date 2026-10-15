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

## T1.3 — `GET /v1/runs/:runId/strategy-layers` (2026-10-15)

Modelo: `sonnet`. Sem migration; `packages/strategy-engine` e `packages/run-recording` intocados.

- **Rota** (`apps/api-ativada/src/runs/projections/strategy-layers.{route,docs,schema,use-case}.ts`): `access: USER`,
  `documentation` com o esquema Zod de saída, query estrita (`from`/`to`, `to ≤ from` é `to: must_be_after_from`), política
  `RUN_CHART` (o mesmo balde de 30/min do `/chart`). Resposta em colunas (`layers-1`): `candleTimes`, `score`, `actions`, `atr`,
  `lines` (uma por saída das regras de PREÇO: Donchian, cruzamento de EMA, Bollinger, na ordem das regras; rótulo do servidor com
  o período e a vírgula decimal) e `thresholds` por trecho. Sem `to`: fim da faixa da execução; sem `from`: 1.000 velas para
  trás; recorte à faixa da execução (fora dela: `from: outside_run`); mais de 1.000 velas: `to: range_too_large` SEM consultar o
  banco. Fila ou ao vivo sem vela: listas vazias. Estratégia sem regra de preço: `lines: []`.
- **Walk-forward**: um trecho de limiar por janela de teste que terminou bem (a combinação sai de `best_params` por
  `deriveStrategyConfig`, só leitura de configuração); a janela parada não tem limiar, mas as barras do placar dela aparecem; o
  rótulo perde os números quando o período da regra muda entre janelas.
- **No máximo 4 consultas**: execução, versão, janelas (só walk-forward) e as linhas da faixa (`projection-context.ts` é a
  leitura única que a rota das previsões, T1.4, também usa). Ligado em `create-api-routes.ts` e
  `create-domain-route-dependencies.ts`.
- **Contratos** (`test/api-run-strategy-layers.contract.test.ts`, `loadApiApp()`): formato em colunas, as 7 linhas e os rótulos,
  valores em texto decimal e `null`, limiares recortados, `lines: []`, fila vazia, teto de 1.000 velas (1.000 passa, 1.001 é 400
  sem consulta), recorte e `outside_run`, walk-forward com dois limiares e janela parada, 401, 404 igual (alheia, inexistente,
  malformada, apagada), 400 com todos os erros e sem eco, esquema Zod da resposta, 3 ou 4 consultas e o 31º pedido é 429. O
  repositório em memória (`in-memory-projections.fixture.ts`) conta o resumo pelo ORÁCULO independente.

Gates (WSL, espelho `~/gates/ativada-spec9`): `typecheck`, `lint` e `format:check` limpos; 151 testes passam (os 25 novos e os
vizinhos `api-openapi`, `api-docs-page`, `api-run-chart`, `api-run-live-status`, `api-runs`, `admin-boundary-routes`).

## T1.4 — `GET /v1/runs/:runId/projections` (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados.

- **Rota** (`apps/api-ativada/src/runs/projections/projections.{route,docs,schema,use-case}.ts`, mais `projection-items.ts`,
  `projection-summary.ts`, `projection-current.ts`): `access: USER`, `documentation`, política `RUN_LIVE_STATUS` (o balde de 60/min,
  agora com três rotas), `limit` 1 a 100 (padrão 24) e `cursor` = `encodeTimeCursor`. Resposta `{ version: 'projection-1',
  timeframe, current, summary, items, nextCursor }`. `current` só para a `live_paper` rodando (lado, força, postura pelas posições
  abertas, faixa de ±ATR, frase pronta) ou `unavailable` com `not_running` > `no_candle` > `warming_up` > `neutral`; o resumo vem da
  consulta única da T1.2 e as taxas, o Wilson e as frases saem em TypeScript; `items` com `pending` (fora da faixa) e `gap`
  (dentro da faixa e ausente em `candles`). Qualquer tipo de execução responde (sem 409).
- **No máximo 6 consultas**: execução, versão, janelas (só walk-forward), resumo e página (juntos), a linha mais nova (só em página
  mais antiga da ao vivo) e as posições (só quando há tendência).
- **Contratos** (`test/api-run-projections.contract.test.ts`, 26 testes): resumo e itens com contas à mão (acerto, erro, empate,
  sem lado, pendente, faixa, variação a 4 casas para baixo), tendência com e sem posição, cada motivo de "sem previsão" e a
  precedência, backtest sem `current`, walk-forward só com a janela de teste que terminou bem e o limiar dela, lacuna, cursor
  (páginas concatenadas = lista), 24 por padrão, 5 e 6 consultas, 401, 404 igual, 400 sem eco e o 61º pedido é 429. O contrato
  `api-openapi` ganhou as duas rotas (429 e códigos de erro).

Gates (WSL, espelho): `typecheck`, `lint`, `format:check` limpos; 223 testes passam (os 26 novos mais `api-openapi`,
`api-docs-page`, `api-run-*`, `api-runs`, `admin-boundary-routes`, `code-size-limits`, `app-import-boundary`).

## T1.5 — Vela em formação no `/v1/stream` (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; o worker continua gravando só vela fechada (`x` verdadeiro).

- **Pacote de mercado**: o ticker (`createTickerStream`) aceita `timeframes` e assina `<par>@kline_<tf>` na MESMA conexão do
  `miniTicker` (`btcusdt@miniTicker/…/btcusdt@kline_1h/…`; o teto de 1.024 streams vale pelo total); `ticker-candle.schema.ts` lê a
  kline ABERTA e a fechada (nome do stream conferido com o par e a vela do próprio payload, preço e volume em texto decimal) e
  `onCandle` recebe `RawCandle`; vela de par ou tamanho não assinado é descartada como `unsubscribed`. `candle-aggregator.ts`
  agrega no máximo 1 por segundo por (par, vela), a última, ignorando evento igual ou mais velho.
- **API**: `TICKER_KLINE_ENABLED` (padrão `false`; `true` em `envs/env.dev`, `false` em `env.test` e `env.live72`; só vale com o
  ticker ligado). O publicador ganhou `handleRawCandle` (`candle-intake.ts`) e entrega `{ type: 'candle', symbol, timeframe,
  openTime, open, high, low, close, volume, closed, at }` ao tópico do par: só os sockets que assinaram o par (mesma assinatura do
  ticker e o mesmo teto de pares por socket).
- **Contratos**: `candle-aggregator` (agregação e leitura do kline), `ticker-kline-stream` (nomes na conexão única, vela
  aberta e fechada, tamanho e par não assinados), `market-candle-stream` (50 eventos = 1 mensagem com a forma documentada, isolamento
  por par e por usuário), pipeline completo com a Binance falsa (flag ligada e desligada) e o ambiente. 11 mutantes novos em
  `ticker-mutants` (agregador, chave por vela, reentrega, nome do stream, par, flag `closed`, tamanho e par não assinados, nome da
  assinatura): todos reprovados (38 testes do arquivo passam).
- **`stream-api-test`**: caso novo "vela em formação": 40 eventos de kline da Binance falsa viram 1 mensagem `candle` com os
  mesmos bytes para os dois usuários e o par não assinado (ETHUSDT) não chega.
- **`stream-mutants`**: o mutante `LISTENER_DROPS_THE_PAYLOAD_VALIDATION` já falhava ANTES desta task (o `find` `z.strictObject({`
  passou a aparecer 2x em `run-event.schema.ts` desde os alertas de preço, T4b.7); o `find` agora é
  `const runEventSchema = z.strictObject({` e os 8 mutantes são reprovados.
- **Desvio de ambiente**: `make stream-api-test` e `make stream-mutants` sobem o Docker de teste; rodaram os MESMOS scripts
  (`scripts/stream-api-test.ts` e `scripts/stream-mutants.ts`) com o `env.test` apontando para o Postgres embutido do WSL
  (porta 56437). Resultado: `stream-api-test: OK` e `stream-mutants: OK - 8 mutantes reprovados`.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; 138 testes vizinhos passam (mercado, ticker, pipeline,
endpoint, ambiente, `code-size-limits`, `app-import-boundary`).

## T1.6 — Mutantes das camadas, da previsão e dos filtros de dono (2026-10-15)

Modelo: `sonnet`.

- **`test/api-run-projections-mutants.contract.test.ts`**: cada mutante copia o `src` da API (alvo `PROJECTIONS_MUTANT_TARGET`) ou o
  `src` do `@ativada/statistics` (alvo `STATISTICS_MUTANT_TARGET`, que o contrato do Wilson passou a carregar por
  `STATISTICS_SOURCE`) e os contratos `api-run-projections`, `api-run-strategy-layers`, `projection-rule`, `projection-messages` e
  `api-openapi` (os de regra e de frases agora carregam por `loadApiApp()`) precisam reprovar. Mortos: dono (execução alheia
  com resposta diferente), rotas públicas, sem limite de requisições, query frouxa, cursor sem validar, página padrão, limite e cursor
  ignorados, sem `nextCursor`, teto de 1.000 velas (`>=`, removido, janela padrão pela metade, `to` sem recorte), limiares sem
  recorte, janela parada contada, limiar-base em toda janela, trecho que não começa uma vela antes, rótulos (papel trocado, vírgula,
  números no walk-forward), força (`≤` → `<` nas duas bordas), limiar do lado errado, lado do zero, postura sem posição, faixa
  arredondada para dentro (as duas bordas, e casas a 2), borda dentro da faixa, empate contado, venda julgada como compra, taxa
  para cima e a 3 casas, `counted` com empates, veredito fixo, ordem da força, pendente × lacuna, tendência fora da ao vivo rodando,
  horizonte de uma vela, aquecimento × sem vela, página antiga repetindo a tendência, frases (força, lado, sinal `+`, moeda ao ar,
  histórico) e o Wilson (mínimo 29, z² errado, abaixo como acima, sucessos acima do total): 62 testes, 0 falhas. (A primeira rodada
  caiu num `ENOENT` porque rodei `format` e `typecheck` no espelho ao mesmo tempo, e o `rsync --delete` apagou a cópia; refeita
  sozinha, passou.)
- **`scripts/api-runs-mutants.ts`**: +3 filtros de dono no Postgres real (o pedido era +2; a terceira leitura, `listProjectionItems`,
  merecia o seu): `PROJECTION_LAYER_ROWS_READ_EVERY_OWNER`, `PROJECTION_SUMMARY_READS_EVERY_OWNER` e
  `PROJECTION_ITEMS_READ_EVERY_OWNER`. Resultado: `api-runs-mutants: OK - 28 mutantes de filtro de dono reprovados` (rodado com o
  Postgres embutido do WSL no lugar do Docker de `make api-runs-mutants`).
- Dois contratos ganharam um caso para matar mutantes: backtest AINDA rodando não tem tendência atual e `to` no futuro é recortado
  antes de contar as 1.000 velas.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; 293 testes vizinhos passam (`api-run-*`, `api-runs`,
`api-openapi`, `ownership-registry`, `strategy-engine-boundary`, `code-size-limits`, `app-import-boundary`, `database.contract`,
Wilson, regra, frases e oráculo).

## T2.1 — Esquemas espelhados e consultas do gráfico (2026-10-15)

Modelo: `sonnet` (a fase pedia `haiku`; a execução ficou com o mesmo agente das três tasks). Sem migration; motor e `run-recording` intocados.

- **Esquemas Zod do painel** (`apps/frontend-ativada/src/runs/candle-chart/`): `strategy-layers.validation.ts` (versão `layers-1`, as 7 funções de linha, colunas com o mesmo
  tamanho de `candleTimes`, limiares em texto decimal), `projections.validation.ts` (versão `projection-1`, `current` com `available` ou `unavailable` e o motivo, resumo,
  veredito, itens com o resultado `gap`) e `market-candles.validation.ts` (velas públicas, preço e volume em texto). A mensagem `candle` do `/v1/stream` entrou em
  `src/live/stream.validation.ts` (OHLCV em texto decimal, `closed`, `at`); o `StreamClient` ganhou o `onCandle` opcional (a T3.4 liga o `MarketStore`).
- **Consultas** (`candle-chart.query.ts`): `useStrategyLayersQuery` e `useProjectionsQuery` sob a chave raiz `runs` (o aviso do stream as refaz) e
  `useMarketCandlesQuery` sob `markets` (`MARKET_QUERY_ROOT`). Resposta fora do contrato vira `error` e nada é entregue ao componente.
- **Contratos** (`test/candle-chart-queries.contract.tsx`, 14 testes; `stream-client.contract.ts` +2): aceita o formato do servidor e cada motivo de "sem previsão";
  recusa outra versão, número no lugar de texto, coluna de outro tamanho, papel de linha desconhecido, limiar em notação científica, veredito e resultado desconhecidos;
  chaves começam com `runs`/`markets`; parâmetros enviados na URL; vela em formação entregue só ao `onCandle` e mensagem malformada descartada.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 811 passam, 0 falham.
