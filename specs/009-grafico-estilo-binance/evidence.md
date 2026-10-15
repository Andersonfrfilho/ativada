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

## T2.2 — Glossário e tokens do gráfico (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados.

- **Glossário** (`src/glossary/glossary.constant.ts`): 7 termos novos, uma frase de uma linha cada (20 a 120 caracteres, sem repetir rótulo nem frase, nenhuma promete lucro ou preço):
  vela em formação, volume, placar, tendência, faixa (ATR), acerto do lado e moeda ao ar. O `SCORE` antigo ("Pontuação do placar") continua; "Placar" é o termo do painel de pontuação por vela.
  `test/glossary.contract.ts` prende os rótulos, as 7 frases literais e a ausência de promessa ("lucr", "ganh", "garant", "certeza", "vai subir/cair").
- **Tokens** (`src/styles/global.css`, no bloco `:root`, sem hexadecimal novo): `--chart-grid`, `--cone-up`, `--cone-down` e `--cone-neutral` por `color-mix(in srgb, …)` sobre `--ink-3`, `--buy`, `--sell`, `--bench` e `--surface`;
  como a mistura usa `var()`, ela acompanha o tema claro, o escuro (`prefers-color-scheme`) e o `data-theme` sem redeclarar.
- **Contraste** (`test/contrast.contract.ts`): o teste resolve cada `color-mix` com a paleta do tema e confere os cones contra `--surface` e `--surface-2` a ≥ 3:1 (elemento gráfico, WCAG 1.4.11).
  Medido (surface / surface-2): claro buy 4,04 / 3,48, sell 4,31 / 3,71, neutro 3,68 / 3,16; escuro buy 6,44 / 5,87, sell 5,39 / 4,91, neutro 4,52 / 4,12.
- **Desvio declarado:** `--chart-grid` NÃO chega a 3:1 (claro 1,90, escuro 2,19; piso do teste 1,5:1 e "mais discreta que o cone"). A RNF06 lista velas, linhas, cone e setas a 3:1, não a grade, e o valor de cada linha
  está nos rótulos do eixo; uma grade a 3:1 competiria com as velas. Se o usuário preferir 3:1 também nela, é trocar o 45% do token (≈ 75%) e o piso do teste.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 830 passam, 0 falham.

## T2.3 — Puros do gráfico (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados. Nada de React: só funções puras e uma preferência de tela.

- **`src/runs/candle-chart/`**: `candle-series.ts` (a ÚNICA conversão texto→`number`, `toDrawingNumber`, mais segundos UTC, velas, barras de volume com a cor decidida por comparação exata em `BigInt`),
  `strategy-line-series.ts` (vela sem valor vira lacuna, nunca zero), `score-series.ts` (barras do placar e trechos de limiar), `marker-series.ts` (a seta cai na vela que contém o preenchimento em qualquer vela da tela;
  `null` = agrupado = sem setas), `projection-cone.ts` (`toSurfaceProjection` e `buildProjectionCone`: abertura por √fração, nunca encolhe nem sai da faixa gravada, metade colorida do lado da tendência; sem tendência ou sem faixa, sem cone),
  `candle-paging.ts` (quando pedir a página anterior, o intervalo `[from, to)` terminando na primeira vela que já existe, junção sem repetir vela, teto de 20.000 que descarta as mais distantes do foco),
  `ohlc-text.ts` (legenda A/M/m/F com as mesmas casas, variação sobre o fechamento anterior em `BigInt` para baixo, volume compacto "23,9 mil", frase do `aria-live`) e `chart-preferences.ts`
  (`localStorage` com `try/catch`, Zod com `.catch` por campo; "Stop e alvo" e "Esperou" desligados). Constantes em `candle-chart.constant.ts`. A previsão é só a tendência do placar com a faixa gravada; nenhuma função devolve preço-alvo.
- **Contratos** (5 arquivos novos, 42 testes, todos na lista explícita do `package.json`): `chart-series` (inclui a guarda de que NENHUM outro arquivo da pasta chama `Number(`, `parseFloat` ou `parseInt`), `projection-cone`, `candle-paging`
  (cinco páginas de 1.000 viram exatamente 5.000 sem repetir; a vela mais nova do mesmo `openTime` vale), `ohlc-text` (fusos `America/Sao_Paulo` e `America/New_York`: 03:00 e 02:00 para a mesma vela, e a data muda na virada do dia; variação "-0,20%" conferida à mão)
  e `chart-preferences` (JSON quebrado, valor estranho, campo inválido cai sozinho, armazenamento que lança).

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 872 passam, 0 falham (68 arquivos).

## T3.1 — Adaptador da biblioteca, tema e crédito (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; nenhuma dependência nova (a `lightweight-charts@5.2.1` já estava instalada).

- **Adaptador** (`src/runs/candle-chart/lightweight-surface.ts`, `createLightweightSurface`): o ÚNICO arquivo que importa `lightweight-charts`
  (P14). O limite de 200 linhas por arquivo obrigou a repartir o adaptador em irmãos `lightweight-*.ts` (`-context`, `-render`, `-data`,
  `-view`) que NÃO importam o pacote: recebem os valores por `kit` (as séries, `LineStyle`, `ColorType`, `TickMarkType`) e os tipos por
  reexportações de `lightweight-surface.ts` (só tipos, apagadas no build). As decisões de cor, traço e forma moram em `surface-style.ts`
  (puro, com contrato), e as caixas de "Stop e alvo" são um primitivo da série em `level-boxes-primitive.ts` (também sem importar o
  pacote). `chart-theme.ts` mapeia cada cor a um token de `global.css` (`SURFACE_THEME_TOKENS`) e `chart-theme-dom.ts` resolve o token
  pelo navegador e o converte em `rgb()` por um pixel de canvas (a biblioteca não lê `color-mix()`).
- **Painéis**: preço (velas, linhas da estratégia, marcadores, cone da previsão, vela em formação e linha do preço real), volume e
  placar (só existe enquanto há barras de placar). `attributionLogo: false` sempre (P12); crédito do `NOTICE` em `ChartCredit`
  (P13: "TradingView Lightweight Charts™" com link `https://www.tradingview.com/`, `rel="noreferrer"`, e "Copyright (c) 2025 TradingView, Inc.").
- **Carregamento**: `chart-surface-loader.ts` faz `await import('./lightweight-surface.js')` e o `ChartSurfaceLoaderContext` deixa os testes
  trocarem o carregador pela superfície falsa; um contrato prova que nenhum outro arquivo importa o adaptador de forma estática.
- **Ciclo de vida** (`useChartSurface`): cria no `useEffect`, destrói na saída e descarta a criação que termina depois da saída; falha ao
  carregar vira `hasFailed`, nunca exceção. **Tema** (`useSurfaceTheme`): lê os tokens quando a superfície nasce e a cada troca de tema (a
  escolha do usuário ou o esquema do sistema).
- **Porta estendida** (aditivo, antes da primeira ligação real): `setLevels`, `setWaited`, `setTimeLabels`, `onClick`, `centerOn` e
  `isSelected` no marcador; a superfície falsa ganhou os mesmos métodos.
- **Contratos** (`chart-surface-lifecycle`, 8 testes; `surface-style`, 7): criar e destruir, StrictMode (monta duas vezes e só a última fica
  viva), criação tardia depois da saída, falha de carga, troca de tema reaplica as cores do mesmo objeto, crédito, tokens pedidos ao
  resolvedor, `withAlpha`, cores do volume e do placar, marcadores (setas, pontinho de "esperou", ordem), linhas por papel e as metades do
  cone. O guarda "nenhuma outra conversão texto→número" da T2.3 passou a valer também para os arquivos novos (a leitura de canal de cor
  usa `toDrawingNumber`).
- **Limite honesto**: o desenho real (canvas) NÃO foi exercido aqui: o happy-dom não tem canvas, o WSL não tem o Chromium do Playwright e instalar
  é proibido. O adaptador passa no typecheck contra os tipos reais da biblioteca e no lint; o desenho, a vela em formação sem contorno
  tracejado (a biblioteca não tem contorno tracejado de vela: ela fica oca, só contorno e pavio) e as caixas de "Stop e alvo" ficam
  para a conferência da T3.8 (E2E com canvas) e da T4.1.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 888 passam, 0 falham (70 arquivos).

## T3.2 — `CandleChart` no `TradeChartCard` (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; nenhuma dependência nova.

- **Cartão**: `TradeChartBody` passou a receber `view` e `selection` e entrega `CandleChart` (`src/runs/candle-chart/`). O aviso, o resumo, os atalhos e
  campos de data (`ChartRangeControls`), o `LiveChartStatus` e a tabela de operações continuam como estavam; a faixa `?de=&ate=` continua sendo a única fonte
  da faixa e agora decide a janela de velas. O `/chart` segue servindo `symbol`, `timeframe`, `runRange`, as setas e os agrupamentos.
- **Velas**: `useCandleHistory` (reducer em `candle-history.reducer.ts`) pede a primeira página por `GET /v1/markets/candles` (as últimas 1.000 velas da faixa ou do
  período, ou 1.000 em volta do instante em foco: `candle-window.ts`, puro), junta a vela nova que fecha no fim sem reenquadrar (a série tem uma âncora estável;
  só o fim cresce), e pede a página anterior quando a janela chega a 50 velas da borda esquerda, uma por vez, sem repetir vela e parando no começo do período.
  Trocar par, vela ou faixa troca a série sem esvaziar a tela. Chave das páginas sob `markets`, cache sem fim (vela fechada é imutável).
- **Tela**: seletor 15m · 1h · 4h · 1d (a vela da execução vem marcada "da execução", `aria-pressed`), botões Afastar, Aproximar, Ajustar e Agora (44 px), legenda
  OHLC (`OhlcLegend`: par, vela, data e hora no fuso, A/M/m/F, variação com seta e sinal, volume; a última vela sem cruz, a apontada com ela), volume, setas de
  compra e venda, cruz e clique (clicar numa vela com seta seleciona a operação em `?operacao=`, sem mexer na faixa), botões de agrupamento acima de 500 eventos
  e o texto para leitor de tela (`describeChart`). O gráfico acompanhando o fim abre nas últimas 150 velas; com faixa na URL, ajustado a ela.
- **Troca de vela mantém o centro**: o instante da vela central visível vira "foco"; a janela nova sai em volta dele e o gráfico é centralizado nele
  (`centerOn`); o foco some quando a pessoa escolhe outra faixa. Fora da vela da execução aparece "Previsão, placar, canal e "esperou" só aparecem na vela de 1 h,
  que é a que a estratégia usa." Compras e vendas aparecem em qualquer vela.
- **Reserva**: sem velas públicas do par (404, erro, vela que o painel não conhece) ou com o desenho que não carregou, entra o gráfico SVG da spec 005
  (`SimpleChartFallback`) com uma frase do motivo; operações, faixa e seleção continuam valendo. O adaptador é carregado por `import()` dinâmico: o `vite build`
  gerou o pedaço `lightweight-surface` (185 KB, 60 KB gzip) à parte; o pedaço principal passou de 207,8 KB para 214,2 KB gzip.
- **Testes antigos do SVG**: os contratos `trade-chart-card`, `trade-selection`, `live-trade-chart`, `trade-chart-markers` e `price-chart` não mudaram e continuam
  verdes porque, sem rota de velas no `fetch` falso, o cartão cai na reserva SVG; eles seguem provando URL, seleção, tabela, aviso de vela nova e as setas do
  gráfico simples. As mesmas garantias com o `CandleChart` estão em `candle-chart.contract.tsx` (URL → janela de velas, clique → `?operacao=`, agrupamentos →
  faixa na URL); o aviso "há velas novas" e a seleção linha → setas com o gráfico novo entram com a T3.4/T3.3. O contraste não mudou (cores só por tokens).
- **Contratos** (`candle-chart`, 12 testes com a superfície falsa e velas geradas pelo pedido; `candle-window`, 6): dados certos à superfície (primeira vela, volume,
  setas com palavra e tempo da vela que contém o preenchimento, rótulos de hora), janela da primeira página e da URL, abertura nas últimas 150 velas ou ajustada,
  legenda da última vela e da apontada, página anterior pedida uma vez perto da borda (`to` = primeira vela, 2.000 velas sem repetir, em ordem), parada no começo
  do período, troca de vela mantendo o centro (pedido em volta do instante e `centerOn`), aviso fora da vela da execução, seleção por clique, agrupamentos e a reserva.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 906 passam, 0 falham (72 arquivos).

## T3.3 — Camadas do gráfico (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; nenhuma dependência nova.

- **Barra de camadas** (`LayerBar`): "Previsão", "Compras e vendas", "Linhas da estratégia", "Stop e alvo" e "Esperou", cada uma um botão com caixa marcada (☑/☐), palavra,
  `aria-pressed` e 44 px; padrões da spec §5 D12 e da spec 008 D6: previsão, compras e vendas e linhas ligadas, **"Stop e alvo" e "Esperou" desligadas**
  (preferência no `localStorage`, que já guardava os cinco campos). Previsão e "Esperou" só existem na simulação ao vivo (`isLive`); previsão, linhas e "Esperou"
  ficam desabilitadas fora da vela da execução (RF05); compras, vendas e "Stop e alvo" valem em qualquer vela. No celular a lista fica recolhida atrás do botão
  "Camadas do gráfico" (`aria-expanded`, classe `layersClosed` escondida por `@media (max-width: 639px)`; no desktop o botão some e a lista fica à mostra).
- **Linhas e placar** (`useChartLayers`, `useLayerSurface`): `GET /v1/runs/:id/strategy-layers` pela janela visível (no máximo 1.000 velas, o teto da API, andando em
  blocos de 250 velas em volta do centro visível, sempre dentro do período da execução: `computeLayersWindow`, puro); as linhas são as de `signals.indicators`
  (um rótulo de texto cada, ou "Esta estratégia não usa linhas sobre o preço"), as barras do placar vão ao painel de baixo com as linhas tracejadas de compra e
  venda do último trecho de limiar e o rótulo "Placar da estratégia — compra em +2, venda em −2" (sinal de menos verdadeiro, vírgula decimal).
- **Isolamento de erro (§15)**: cada camada tem a própria consulta (`strategy-layers`, `projections`, a lista de operações já compartilhada com a tabela); nenhuma vai
  num `Promise.all`. A falha das camadas mostra "Não foi possível carregar o placar e as linhas da estratégia; as velas e as operações continuam." e as velas, as
  setas e a tabela seguem (contrato com `strategy-layers` respondendo 500).
- **Compras e vendas**: a camada desliga as setas; acima de 500 eventos os botões de agrupamento da T3.2 continuam. **"Stop e alvo"**: caixa verde (entrada → alvo)
  e vermelha (entrada → stop) de cada operação, da compra à venda, e a aberta vai até a ponta direita; `tradeSchema` ganhou `stopPrice` e `targetPrice` opcionais
  (a API já os devolvia em `/trades`) e as caixas usam a mesma lista de operações da tabela (sem pedido novo). **"Esperou"**: um pontinho pequeno e discreto em cada
  vela de espera (`/chart.decisions`, só `live_paper` com até 500 velas); sem decisões a tela diz "Aproxime o gráfico para ver cada decisão".
  **Previsão**: `toSurfaceProjection` leva a tendência e a faixa gravada de ±1 ATR à superfície (meio-cone colorido do lado da tendência e linha plana no preço de
  partida); nunca um preço-alvo; só na simulação ao vivo, com a camada ligada e na vela da execução.
- **Contratos** (`candle-layers`, 14 testes; `layer-series`, 8): janela das camadas pedida (≤ 1.000 velas, dentro do período), linhas e barras do placar na superfície, rótulos
  em texto, estratégia sem linhas, falha isolada, padrões ligados e desligados em backtest e na ao vivo, desligar apaga na superfície e a escolha é lembrada,
  fora da vela da execução as camadas de estratégia somem e nem são pedidas, recolhimento no celular por classe (CSS e `aria-expanded`), caixas de stop e alvo (fechada
  e aberta), pontinhos de "esperou", previsão ligada e desligada e backtest que nunca pede a previsão; puros: janela, caixas, pontinhos e rótulo do placar.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 928 passam, 0 falham (74 arquivos).

## T3.4 — Ao vivo: vela em formação e preço real (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; nenhuma dependência nova; nenhuma mudança na API.

- **Ligação do stream** (`src/live/`): `CandleStore` guarda só a vela ABERTA de cada par e vela (chave `par|vela`), fora do React e separada do preço (a mensagem `candle`
  chega a 1 por segundo; só quem desenha a vela re-renderiza). Mensagem de vela mais velha, ou mais velha da mesma vela, não desfaz a atual; a mensagem
  `closed: true` tira a vela do armazém (a fechada de verdade chega por REST, depois do aviso `runs`). `MarketStore` expõe `candles` e o `clear` limpa os dois.
  `StreamHandlers` ganhou `onCandle` (opcional), `useLiveStream` o liga a `store.candles.apply` e a `FakeStream` dos testes ganhou `candle()`.
- **`useLiveCandle(symbol, timeframe)`** + `judgeLiveCandle` (puro): a vela é `forming` com o socket no ar e mensagem dentro do limite de silêncio do painel (10 s,
  o mesmo do selo de preço); passando do limite, ou com o socket fora do ar, vira `no_data` com os segundos. Fora do provedor do mercado não há vela nem erro.
- **No gráfico** (`useFormingCandle`): só na `live_paper` que acompanha o fim (sem faixa na URL; com faixa fixa o gráfico não anda). A vela entra por `setLiveCandle`,
  sem tocar nas velas fechadas, no placar nem nas linhas (a decisão é sempre da vela fechada). A legenda mostra a vela em formação, com a palavra "em formação" e o
  volume, quando a cruz não aponta outra. A superfície desenha a vela em formação só com contorno e pavio na cor da direção (a biblioteca não tem contorno tracejado)
  e a linha contínua do preço real do último fechamento até o fechamento parcial. Parou de chegar: a vela sai e aparece "Sem dados ao vivo há N s: a vela em
  formação volta quando o preço voltar a chegar."
- **Vela fechada pelo aviso `runs`**: o aviso refaz o `/chart`, o período da execução ganha a vela que fechou e a série (âncora estável) pede só a ponta nova
  (`[fim anterior, fim novo)`), juntando ao fim sem reenquadrar o gráfico; com faixa fixa o aviso "Há velas novas — ir para o fim" aparece e leva de volta ao fim.
- **Contratos** (`candle-live`, 8 testes, com a superfície falsa e o stream falso; `live-candle`, 7 puros): a mensagem `candle` atualiza só a vela aberta (as velas
  fechadas e o placar não são redesenhados), a legenda diz "em formação", outro par, outra vela e mensagem atrasada são ignorados, a mensagem fechada tira a vela,
  backtest e faixa fixa nunca desenham a vela, o silêncio vira "sem dados" e a volta reaparece, o aviso refaz a ponta com a vela que fechou (960 → 961 velas) e a
  garantia do aviso "Há velas novas" com o gráfico novo; puros: armazém (ordem, par, vela, relógio do navegador, ouvintes) e o julgamento forma/sem dados.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` 943 passam, 0 falham (76 arquivos); `vite build` com o pedaço `lightweight-surface`
à parte (185 KB, 60 KB gzip) e o principal em 216,8 KB gzip.

## Resumo da execução T3.1 a T3.4 (para a T3.5 em diante)

- Pendências visuais para a T3.8 e a T4.1 (nada disto foi exercitado com canvas real: sem Chromium no WSL e instalar é proibido): aparência do adaptador
  (`lightweight-surface.ts`), caixas de "Stop e alvo" (primitivo `level-boxes-primitive.ts`), meio-cone e linha plana (linhas de 2 pontos, sem a curva de √ do
  `buildProjectionCone`, porque a biblioteca espaça por vela e não por tempo), vela em formação oca (sem contorno tracejado), contraste dos pontinhos de "esperou"
  e dos rótulos "alvo"/"stop" a 3:1, e os 60 quadros/s ao arrastar 5.000 velas (RNF02).
- A `NextCandlePanel` (T3.5) pode ler `useProjectionsQuery` e `useLiveCandle` sem mudar o que existe; `ChartLayerData.projection` já carrega o `current`.
- O teclado e o anúncio (T3.7) entram em `useCanvasInteractions` (índice da cruz) e no contêiner `role="img"` do `CandleCanvas`, que hoje só tem `aria-label` e a
  descrição textual (`describeChart`, sem a previsão ainda).

## T3.5 — `NextCandlePanel`: a próxima vela de perto (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; nenhuma dependência nova; nenhuma mudança na API.

- **Painel** (`NextCandlePanel`, ao lado do canvas a partir de 1.024 px e embaixo no celular; só na simulação ao vivo com a camada "Previsão" ligada): SVG pequeno à mão
  (`NextCandleChart`, viewBox 320×210, cores só por classes do módulo e tokens `--cone-*`, `--buy`, `--sell`, sem estilo em linha e sem animação) com as 5 últimas velas fechadas,
  a vela em formação ampliada (caixa tracejada do que ela já andou, esticada pelo tempo da vela), o **meio-cone** do lado da tendência (a metade colorida do lado da tendência, a outra
  neutra; abre por √fração como `buildProjectionCone`), a linha plana tracejada no preço de partida, a **linha do preço real** (um ponto por mensagem da vela em formação, `usePriceTrail`)
  com o marcador "agora" e o rótulo da tendência. Nada de preço-alvo: o cone é a faixa gravada de ±1 ATR.
- **Texto**: "Próximos 15 min (até a decisão das 05:00)" (o tempo que falta vem de `horizonEndsAt` do servidor e do relógio de 5 s do painel; depois do fechamento, "Fechando agora"),
  `label` ("Tende a COMPRAR · fraco") e `message` ("Placar +1 de +2 para comprar.") **do servidor**, "Faixa típica: 12,778 a 13,032." (preços do servidor só formatados), e o texto fixo
  "Tendência, não promessa." Estado = ícone + palavra + cor (seta para cima/baixo, "Sem previsão agora" com `=`, aviso `!` para o preço parado).
- **Resultado ao fechar** (`findRecentResult`, olha só as duas previsões mais novas): "Acertou: o preço subiu 0,27% — ficou dentro da faixa." / "Errou: o preço caiu 0,27% — ficou fora da faixa." /
  "Empatou: o preço fechou igual e esta previsão não conta." (a porcentagem é a `moveRate` do servidor com a vírgula deslocada em BigInt; pendente, sem lado e vela ausente não mostram nada).
- **Todos os estados sem previsão (RF16)**, com o texto literal e **sem faixa**: `neutral`, `warming_up`, `no_candle` e `not_running` com a frase do servidor; `other_timeframe` ("A estratégia decide em velas de 1 h;
  troque para 1h para ver a previsão.") e preço parado ("O preço ao vivo parou de chegar; a previsão volta quando ele voltar.", que vence a tendência e o motivo do servidor); carregando e erro
  ("Não foi possível carregar a previsão; o gráfico e as operações continuam.") sem derrubar o gráfico.
- **Velas recentes do painel** vêm de uma consulta própria sob `markets` (as 5 anteriores a `closedAt`, ou à vela do relógio sem previsão), independente da faixa da URL e do timeframe escolhido no gráfico.
  `ChartLayerData` ganhou `projections` e `isProjectionError`. O ícone `close` entrou em `Icon`.
- **Contratos** (3 arquivos, 39 testes, todos na lista explícita do `package.json`): `next-candle-state` (precedência dos estados, frases literais, tempo restante em fusos `America/Sao_Paulo` e `America/New_York`, janela,
  trilha do preço real, resultado, porcentagem), `next-candle-geometry` (velas na ordem e alinhadas ao divisor, meio-cone de compra e de venda fechando na linha plana, sem tendência sem cone, linha real que parte do preço-base,
  cresce com o tempo e para na borda direita) e `next-candle-panel` (componente com a superfície falsa: compra, venda, cada motivo, outra vela, preço parado, erro, linha real e "agora", resultado, backtest sem painel,
  camada desligada). O teste de geometria pegou um bug real (`reverse()` no lugar mutava a borda de baixo do meio-cone de venda); corrigido antes do commit.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` verde.

## T3.6 — Cartões "De onde vem a previsão" e "Histórico de acertos" (2026-10-15)

Modelo: `sonnet`. Sem migration; motor e `run-recording` intocados; nenhuma dependência nova; nenhuma mudança na API.

- **`ProjectionHistoryCard`** (`src/runs/projection-cards/`, no detalhe de TODA execução, D15): a frase do servidor ("Acertou o lado em 49,42% (171 de 346). Moeda ao ar: 50%. …") e três indicadores —
  **Acertou o lado 49,42% · 171 de 346 previsões** ao lado da **Moeda ao ar 50,00% · "sempre sobe": 50,58%** e **Dentro da faixa 90,85% · 318 de 350 velas** —, o veredito de Wilson do servidor
  como ícone + palavra + cor ("Acima / Igual à / Abaixo da moeda ao ar" ou "Poucas previsões" abaixo de 30 contadas) com a frase longa do servidor e, fora de `too_few`, o intervalo de 95%
  ("entre 44,20% e 54,67%"), barras de acerto por força (a marca de 50% em cada uma, e o mesmo número em palavras) e a tabela das últimas previsões (vela que fechou no fuso do usuário, tendência com
  força, partida, preço da vela seguinte, resultado e "na faixa"/"fora da faixa") com **"Ver mais previsões" por cursor** (cada página é a consulta `projections?cursor=`; a primeira é a mesma do painel da
  próxima vela, então o aviso do stream refaz as duas de uma vez). **Nenhuma conta local**: a porcentagem só desloca a vírgula do texto do servidor em BigInt (`formatRatePercent`); o contrato prova com taxas que
  NÃO batem com as contagens (12,34% para 1 de 100) que a tela mostra o que o servidor mandou.
- **`ProjectionSourceCard`** (só na simulação ao vivo): a régua do placar (`ScoreboardRuler` da spec 008), o voto de cada regra em palavras ("MACD: +1 a favor", com `VoteLabel`), "O que falta:" com a frase do
  servidor da spec 008 (`live-status.triggers.message`, nada duplicado), a faixa em palavras ("numa vela de 1 h o BTC/USDT costuma andar até 0,127 USDT. Por isso a faixa vai de 12,778 a 13,032.", ATR e preços do servidor)
  e o texto fixo "Tendência, não promessa. "Fraco" quer dizer que só metade do caminho até a compra foi andado." Sem tendência, a introdução é a frase do servidor e nenhuma faixa é escrita.
- **Montagem**: `TradeChartCard` devolve o cartão "Preço e operações" e, logo abaixo, `ProjectionCards` (lado a lado a partir de 1.024 px na ao vivo; só o histórico em backtest e walk-forward). O contrato antigo
  "backtest nunca pede a previsão" (`candle-layers`) passou a dizer o que continua valendo: o gráfico nunca desenha a previsão num backtest e só o cartão do histórico pede `projections` (sem cursor).
- **Contratos** (`projection-cards`, 17 testes, na lista explícita do `package.json`): números e frases do exemplo do spec, números exibidos como o servidor mandou, os quatro vereditos e o `too_few` com 29 contadas,
  barras de força, tabela, "Ver mais" pelo cursor, erro e vazio, backtest só com o histórico, e o cartão de origem com a régua, os votos, o que falta, a faixa, sem tendência e com o `live-status` falhando.

Gates (WSL, espelho): `typecheck`, `lint` e `format:check` limpos; `panel-test` verde.
- **Achado no caminho:** como o cartão de histórico (backtest também) e a camada "Previsão" compartilham a MESMA consulta `projections`, o cache chegava ao gráfico de um backtest e desenharia o cone onde não há "próxima vela".
  `useChartLayers` agora só entrega `projection`/`projections` quando a camada está habilitada (ao vivo, vela da execução, camada ligada); o contrato `candle-layers` prova que o backtest não desenha nada na superfície.
