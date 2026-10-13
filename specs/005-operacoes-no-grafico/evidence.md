# Evidência — Spec 005

## T0.1 🧠 — Contrato das operações no gráfico (2026-10-13, `opus`)

Entrega: seção "Operações no gráfico (spec 005)" no fim de `docs/adr/0002-contrato-do-motor-de-estrategias.md`, com
as decisões O1 a O13 e os contratos de teste esperados por rota. Só documentação: nenhum código de produção, teste ou
migration.

Conferido no código (lido, não suposto):

| Ponto | Onde | O que se achou |
|---|---|---|
| `/trades`, `/fills`, `/equity` | `apps/api-ativada/src/runs/run-series.routes.ts`, `run-series.use-cases.ts`, `shared/pagination/read-page.ts` | Query estrita `limit`/`cursor`; `/trades` devolve `PositionInput` inteiro; `closedCandleTime`, `quantity`, `entryFee` e `exitFee` já existem |
| Ordem do `/trades` | `packages/database/src/run-results/run-result-list.ts` (`listPositions`) | `(opened_candle_time, engine_key)` crescente; o plan supunha "aberta primeiro, decrescente" (corrigido em O3) |
| `positions`, `fills`, `candles` | `packages/database/src/schema/*.schema.ts` | Índices listados no ADR; `candles` só com a PK `(exchange, symbol, timeframe, open_time)`; `runs` sem corretora |
| `exitReason` | `packages/strategy-engine/src/engine-vocabulary.constant.ts`, `packages/database/src/run-results/run-result.constant.ts` | `stop`, `target`, `signal`, `command`, `gap`; `end`/`stopped` do plan D7 não existem |
| Notional e caixa | `packages/strategy-engine/src/wallet/exit-fill.ts`, `entry-fill.ts`, `money.ts` | Notional do `fill` sem arredondar; débito `ceil8(notional) + taxa`, crédito `floor8(notional) − taxa` (base de O5) |
| Walk-forward | `apps/api-ativada/src/walk-forward/evaluate-window.ts`, schema `walk_forward_windows` | Só as janelas de teste são gravadas; `test_end` exclusivo (base de O1) |
| Painel | `apps/frontend-ativada/src/runs/run.validation.ts`, `runs.query.ts`, `TradesCard.component.tsx`, `run.constant.ts` | `tradeSchema` é `z.object` (ignora campo novo), só manda `limit`/`cursor`: a mudança aditiva não quebra |

Migration: nenhuma (O8). `[NEEDS CLARIFICATION]` aberto: nenhum. Um índice `fills (run_id, candle_time)` só entra se a
medição da T1.5 passar de 300 ms p95, e aí volta ao responsável antes de ser criado.

Gates: `bun x prettier --check` nos dois arquivos tocados. Testes não se aplicam (só documentação).

## T1.1 — `/trades` aditivo (2026-10-13, `sonnet`)

Entrega: `GET /v1/runs/:runId/trades` ganha a query `from`, `to` (ms UTC, `[from, to)`, sem recorte) e `status=open|closed`
e cada item ganha `entryNotional`, `exitNotional`, `paid`, `received`, `fees` e `netProfitRate` (ADR 0002, O3 a O5).
Nenhum campo existente muda de nome ou tipo; cursor, `limit` e ordem iguais aos de antes. Os preenchimentos da página
vêm numa consulta só (`listFillsOfPositions`: `run_id` + `position_key IN (...)`, dono no tipo). Sem migration.

| Peça | Onde |
|---|---|
| Filtro de faixa e status | `packages/database/src/run-results/run-position-list.ts` (`listPositions`, movido de `run-result-list.ts` por causa do limite de 200 linhas) |
| Preenchimentos da página | `packages/database/src/run-results/run-fill-list.ts` |
| Conta pura de pago, recebido, taxas e % | `apps/api-ativada/src/runs/trades/trade-amounts.ts` |
| Rota, esquema, caso de uso, OpenAPI | `apps/api-ativada/src/runs/trades/run-trades.{route,schema,use-case,docs}.ts`, `run-range-query.ts` |
| Repositório em memória | `test/fixtures/api-routes/in-memory-runs.fixture.ts` (`listPositions` filtra, `fillLookups` conta as consultas de preenchimento) |
| Contrato | `test/api-run-trades.contract.test.ts` (16 casos) |

Provas do contrato novo: valores conferidos à mão contra `fills` (300,123456789 sobe a 300,12345679; 310,987654321 desce
a 310,98765432; pago 300,57345679, recebido 310,51765432, `netProfitRate` 0,03308408); piso para −∞ na 9ª casa
(−0,0033333333 vira −0,00333334); `recebido − pago = netProfit` em decimal exato em 300 posições sorteadas com oráculo
`bigint` que não importa o código da API; faixa (só a compra, só a venda, atravessando fica fora, `from` incluído, `to`
excluído, só `from`, só `to`); `status`; páginas concatenadas com faixa e cursor; uma consulta de preenchimentos por
página; 400 com todos os erros e sem eco; `to <= from`; 404 igual para alheia, inexistente, malformada e apagada.

Desvio do ADR (O4): posição fechada sem preenchimento de venda NÃO vira `500`; os campos que dependem do preenchimento
que falta (`exitNotional`, `received`, `netProfitRate`) saem omitidos. Motivo: o contrato antigo
(`test/api-run-series.contract.test.ts`) semeia posições fechadas sem venda e precisa continuar verde sem mudança. No
banco real os dois são gravados na mesma transação, então o caso não ocorre.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 287 testes
verdes em 16 arquivos (`api-run-trades`, `api-runs`, `api-run-series`, `api-run-series-order`, `api-run-export`,
`api-run-log-export`, `api-run-delete`, `api-run-admission`, `api-run-queue-dispatcher`, `api-run-symbol-filters`,
`api-openapi`, `api-docs-page`, `ownership-registry`, `strategy-engine-boundary`, `code-size-limits`,
`app-import-boundary`).

Pendente: o filtro de faixa e `listFillsOfPositions` contra Postgres real entram na verificação do `make database-test`
da T1.2 (Docker Desktop não sobe nesta máquina agora; ver evidência da T1.2).

## T1.2 — Repositório do gráfico (2026-10-13, `sonnet`)

Entrega (todas as leituras no escopo do dono: `isOwnedRun` antes de ler, `undefined` para execução alheia; sem migration):

| Função (`RunResultRepository`) | Onde | O que faz |
|---|---|---|
| `listPriceColumns(scope, runId, params)` | `packages/database/src/run-results/run-price-columns.ts` | SQL do ADR O7: balde `((open_time - from) * columns) / (to - from)` em `bigint` parametrizado, `exchange` no WHERE, primeiro (abertura), último (fechamento), mínima e máxima por coluna, decimais com `trim_scale` (grafia canônica) |
| `listFillMarkers(scope, runId, {range, limit})` | `run-fill-markers.ts` | preenchimentos da faixa em ordem `(candle_time, order_key)`, com o `net_profit` da posição só na venda |
| `countFillsInRange(scope, runId, range)` | `run-fill-markers.ts` | `count(*) FILTER` de compras e vendas da faixa (dá o `totals` e decide marcadores ou agrupamentos) |
| `listFillClusters(scope, runId, {range, columns})` | `run-fill-markers.ts` | o MESMO balde sobre `candle_time`, só os baldes com preenchimento |

Oráculo puro (sem importar SQL nem produção, `bigint`): `test/fixtures/run-chart/chart-oracle.fixture.ts`, com contas à mão em
`test/run-chart-oracle.contract.test.ts` (7 casos: balde com dízima, `to` excluído, coluna sem vela, grafia canônica).
Os repositórios em memória do harness (`in-memory-runs.fixture.ts`) usam o oráculo e contam as chamadas (`chartCalls`).

Verificação do SQL contra um Postgres de verdade, nesta máquina: o Docker Desktop não sobe agora ("Docker Desktop is unable to
start"), então `make database-test` NÃO foi executado. No lugar, um script descartável (fora do repositório, em PGlite 0.5.9, o
Postgres embutido) rodou as funções reais do repositório, via Drizzle, contra o oráculo:

- preço: 3 séries sintéticas (dízima no balde, uma vela por coluna, faixa menor que as colunas) e 2 conjuntos reais
  (`btcusdt-1h-500`, `ethusdt-1d-400`), 6 faixas/colunas cada (100, 800, 2.000, 137; faixa que começa 1 ms depois; metade da
  série), 30 comparações: todas iguais;
- agrupamento de preenchimentos (100 e 800 colunas), contagem, marcadores (ordem, limite, resultado só na venda), faixa de
  posições e `status`, `listFillsOfPositions`: todos iguais, 0 falhas. O script achou um defeito real na primeira rodada:
  `ORDER BY bucket` com o alias `::text` ordenava por texto (10 antes de 2); corrigido para `ORDER BY bucketed.bucket`.

A mesma verificação ficou como checagens do `make database-test` (`packages/database/test-support/run-chart-checks.ts`:
`checkPriceColumns`, `checkFillMarkers`, `checkTradeFilters`, registradas em `database-test.ts`), com dono alheio recebendo
`undefined` em todas as leituras. **PENDENTE:** rodar `make database-test` num Postgres descartável assim que o Docker Desktop
estiver de pé.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 294 testes verdes
em 17 arquivos (os da T1.1 mais `run-chart-oracle`).

## T1.3 — `GET /v1/runs/:runId/chart` (2026-10-13, `sonnet`)

Entrega: rota nova, só do dono (`access: USER` e `documentation`), query estrita validada por Zod (`from`, `to`, `columns`),
sem migration. `CHART_MARKER_LIMIT = 500` em `runs.constant.ts`.

| Peça | Onde |
|---|---|
| Rota, esquema, OpenAPI | `apps/api-ativada/src/runs/chart/run-chart.{route,schema,docs}.ts` (`columns` 100 a 2.000, padrão 800, texto de dígitos; `to <= from` é `to: must_be_after_from`) |
| Caso de uso | `run-chart.use-case.ts` (contagem + colunas em paralelo; ≤ 500 lê marcadores, 501+ lê agrupamentos; nunca os dois) |
| Faixa da execução (ADR O1) | `run-chart-range.ts` (`resolveRunRange`: backtest concluído = `[period_start, period_end)`; senão, e no ao vivo, até `last_candle_time + duração`; walk-forward = `[min(test_start), max(test_end))`) e `clipRange` (recorta; sem interseção = `400 from: outside_run`) |
| Marcadores e agrupamentos | `chart-views.ts` (`amount` = pago na compra e recebido na venda; `netProfitRate` pelo piso a 8 casas, com pago = recebido − resultado; limites do balde `from + ceil(b·W/C)`) |
| Arredondamento compartilhado | `apps/api-ativada/src/runs/money-rounding.ts` (usado também por `trades/trade-amounts.ts`) |
| Ligação | `routes/create-api-routes.ts`, `create-domain-route-dependencies.ts`; harness `runs-harness.fixture.ts` e `api-app.fixture.ts` (módulos carregáveis pelos mutantes) |
| Contrato | `test/api-run-chart.contract.test.ts` (21 casos) |

Provas: colunas conferidas à mão (cada vela de 100+i abre em 100+i, fecha em 100,5+i, mínima 98+i, máxima 108+i: coluna de
4 velas = primeiro 100, último 103,5, mínima 98, máxima 111); nunca mais colunas que o pedido; recorte da faixa e `to`
excluído; 404 igual para alheia, inexistente, malformada e apagada; 400 com todos os erros e sem eco (`columns` 99, 2001,
`abc`, `1.5`, `-100`, vazio; `to <= from`); exatamente 500 preenchimentos dão `markers` (e o repositório de agrupamento
não é chamado), 501 dão `clusters` (e o de marcadores não é chamado), soma dos agrupamentos = `totals`, limites pela fórmula
com largura que não divide (137 colunas sobre 10 h); `amount`, `netProfit` e `netProfitRate` do marcador iguais aos do
`/trades`; walk-forward só nas janelas de teste (colunas começam em `test_start` e terminam antes de `test_end`); ao vivo
para na última vela processada (a vela gravada depois dela só aparece quando `last_candle_time` avança); execução na fila e
ao vivo sem vela dão listas vazias; resposta valida no esquema documentado.

Auditoria §15: o único `Promise.all` novo junta a contagem e as colunas de preço, ambas do caminho crítico (falhar uma já
invalida a resposta), então não há consulta de refinamento que possa derrubar o fluxo.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 391 testes
verdes em 19 arquivos (os da T1.1 e T1.2, `api-run-chart` e o `api-routes-mutants`, 134 s).

## T1.4 — `GET /v1/runs/:runId/trade-summary` (2026-10-13, `sonnet`)

Entrega: rota nova, só do dono (`access: USER`, `documentation`), sem query (qualquer parâmetro é `400`), resumo da execução
INTEIRA (não muda com o zoom), sem migration.

| Peça | Onde |
|---|---|
| UMA consulta agregada em `numeric` | `packages/database/src/run-results/run-trade-totals.ts` (`readTradeTotals`: `ceil(notional·1e8)/1e8 + taxa` na compra, `floor(...)  − taxa` na venda, só das fechadas; `open_paid` das abertas; `trim_scale` na saída) |
| Caso de uso, rota, OpenAPI | `apps/api-ativada/src/runs/trade-summary/trade-summary.{use-case,route,docs}.ts` (`net = recebido − pago`, grafia canônica) |
| Frase em português | `trade-summary-message.ts` (2 casas, milhar com ponto e vírgula decimal; pago, taxas e pago-na-aberta arredondados para CIMA; recebido e saldo para BAIXO, em direção a −∞; menos tipográfico U+2212 no saldo negativo; "1 compra" no singular; "uma operação ainda aberta" ou "N operações ainda abertas") |
| Oráculo `bigint` (escala 18, sem importar produção) | `referenceTradeTotals` em `test/fixtures/run-chart/chart-oracle.fixture.ts`, usado pelo repositório em memória |
| Contratos | `test/api-run-trade-summary.contract.test.ts` (8 casos) e `test/trade-summary-message.contract.test.ts` (8 casos) |

Reconciliação (RF12, critério 2): em 200 posições fechadas sorteadas, com `net_profit` calculado em `bigint` pela conta do
caixa, `net` é igual à soma de `net_profit` EXATA, `totalReceived − totalPaid` também, e `totalPaid`/`totalReceived` são
iguais à soma dos campos `paid`/`received` do `/trades` (todas as páginas) e à soma recalculada linha a linha do
`/v1/runs/:id/log.csv` (preenchimentos `buy` e `sell`: notional com 12 casas, teto/piso a 8, taxa).

Contas à mão (uma fechada e uma aberta): pago 300,57345679 (notional 300,123456789 sobe a 300,12345679 + 0,45), recebido
310,51765432 (310,987654321 desce a 310,98765432 − 0,47), taxas 0,92, saldo 9,94419753, pago na aberta 412,412; frase
"Você pagou 300,58 USDT em 1 compra e recebeu 310,51 USDT nas vendas. Taxas: 0,92 USDT. Saldo líquido: 9,94 USDT. + uma
operação ainda aberta, com 412,42 USDT pagos." Prejuízo: −0,33333333 vira "−0,34". Execução sem operação soma zero.
404 igual para alheia, inexistente, malformada e apagada.

SQL verificado em Postgres de verdade (PGlite, mesmo script descartável da T1.2): 400 fechadas + 1 aberta com notional de
12 casas, resultado igual ao oráculo (`closedTrades 400`, `totalPaid 182166.00063394`, `openPaid 123.90678902`, execução
vazia e dono alheio). `checkTradeTotals` entrou no `make database-test` (PENDENTE de rodar com Docker; ver T1.2).

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 331 testes verdes
em 20 arquivos (os anteriores mais os dois novos).

## T1.5 — Mutantes do filtro de dono e carga medida (2026-10-13, `sonnet`)

### Postgres real (atualiza os "PENDENTE" das T1.1, T1.2 e T1.4)

O Docker Desktop continua sem subir, então a prova rodou num Postgres 18 de verdade em WSL: binários do pacote
`embedded-postgres@18.3.0-beta.17`, instalados num diretório de rascunho FORA do repositório (`~/pg-scratch`), banco
descartável na porta 56433, derrubado ao fim. Nada disso entra no repositório nem no `package.json`.

- `database-test` (`packages/database/test-support/database-test.ts`): TODAS as checagens até o registro cronológico passaram,
  inclusive as novas desta spec (preço reduzido contra o oráculo em 3 séries sintéticas e nos 2 conjuntos reais; 800
  preenchimentos; faixa e status de operações; resumo de 400 fechadas + 1 aberta; isolamento do gráfico). As duas últimas
  checagens do arquivo (`checkRunEvents` e `checkRunDataWait`, que usam o escutador próprio de NOTIFY com SCRAM) NÃO terminaram
  neste Postgres de rascunho (travaram sem erro; o ambiente de autenticação do rascunho difere do Postgres do compose) e não
  tocam esta spec. **PENDENTE:** `make database-test` completo quando o Docker voltar.
- `scripts/api-runs-mutants.ts` (equivalente do `make api-runs-mutants`, mesmo script e mesmo juiz): CONTROLE passa e os
  **21 mutantes de filtro de dono foram reprovados**. Os 11 de antes continuam mortos (dois estavam com o texto desatualizado,
  porque `run.repository.ts` e `run-ownership.ts` ganharam `isNull(runs.deletedAt)`; o texto foi atualizado e o primeiro ganhou
  uma segunda edição, `also`, para tirar o filtro também da leitura do checkpoint). Os 10 novos: filtro de dono removido de
  `fillsInRange` (marcadores e contagem), do agrupamento, dos preenchimentos das posições, do resumo e da faixa de posições, e
  a conferência `isOwnedRun` removida das cinco leituras do gráfico. O juiz (`route-isolation-test`) ganhou
  `checkChartIsolation` (`run-chart-isolation-checks.ts`): o dono lê as seis consultas; outro usuário recebe zero linhas nas
  funções internas (cada uma filtra o dono sozinha) e `undefined` nas sete do repositório.
- `make api-runs-test` (equivalente, `scripts/api-runs-test.ts`, API real + Postgres real): `OK`, com o novo
  `check-chart-load.ts` ao fim.

### Mutantes da API (rotas, em memória)

`test/api-run-chart-mutants.contract.test.ts` (alvo `RUN_CHART_MUTANT_TARGET`): CONTROLE sólido e **33 mutantes mortos** do
código de produção das três rotas: dono (`/trades`, `/chart` e `/trade-summary` de execução alheia respondendo diferente ou
com lista/resumo vazio; as três rotas públicas), validação (query aberta nas três; `columns` sem teto, sem piso e com padrão
errado), faixa e marcadores (recorte do fim e do início, faixa fora da execução aceita, walk-forward usando o período inteiro,
ao vivo passando da última vela, limite de 500 deslocado, fim do balde arredondado para baixo, compra e % do marcador) e
contas e frase (pago para baixo, recebido para cima, % para zero, taxa de saída ignorada, saldo = recebido + pago, arredondamento
da frase, menos tipográfico, milhar, singular). Dois sobreviveram na primeira rodada e foram corrigidos nos testes: a query
aberta do `/chart` (faltava o parâmetro desconhecido sozinho) e a frase (o teste importava a produção em vez do módulo que os
mutantes substituem; passou a usar `loadApiApp()`).

### Carga medida (plan D9)

Postgres 18 real (WSL, mesma máquina, sem tuning), API real de ponta a ponta (`createApplication`, token JWT assinado por
chamada, JSON do envelope), 17.520 velas de 15 minutos de BNBUSDT (passeio aleatório determinístico, 6 meses) e 1.000 operações
fechadas (2.000 preenchimentos) num backtest concluído. Chamadas sequenciais espaçadas de 550 ms (o limite geral de 120/min
por usuário repõe 2 por segundo); 30 amostras por caso, 40 no de aceite; tamanho é o corpo em UTF-8, sem compressão.

| Caso | p50 | p95 | máx | Corpo |
|---|---|---|---|---|
| `/chart` 800 colunas, período inteiro (aceite; 2.000 preenchimentos viram agrupamentos) | 23,8 ms | **31,4 ms** | 35,3 ms | **144,2 KB** |
| `/chart` 2.000 colunas, período inteiro | 23,8 ms | 31,1 ms | 34,8 ms | 323,0 KB |
| `/chart` 2.000 colunas, faixa com 499 marcadores (maior corpo possível) | 25,5 ms | 35,1 ms | 35,5 ms | 300,1 KB |
| `/chart` de 1 dia (96 velas), 800 colunas | 7,3 ms | 10,3 ms | 13,9 ms | 12,8 KB |
| `/trades?limit=100&from&to` (primeira página) | 9,4 ms | 18,5 ms | 18,9 ms | 38,9 KB |
| `/trade-summary` | 5,8 ms | 6,6 ms | 7,1 ms | 0,3 KB |

Veredito: o p95 do `/chart` é cerca de dez vezes menor que o alvo de 300 ms, então nenhum índice novo é necessário (ADR O8
confirmado; nenhuma migration). O corpo do caso de aceite (800 colunas) ficou em 144 KB, dentro de 150 KB por pouco; os casos
de 2.000 colunas passam de 150 KB, como o ADR já previa (cerca de 160 bytes por coluna). Só medido, sem corte: se isso virar
problema no celular, as saídas são comprimir a resposta (gzip na borda) ou o painel pedir menos colunas.

O check está em `scripts/api-runs-test/check-chart-load.ts` e falha se algum p95 passar de 300 ms.

Gates (WSL, espelho `ativada-spec5`): `tsc --noEmit` limpo; `eslint .` limpo; `prettier --check .` limpo; 367 testes verdes em
21 arquivos (os anteriores mais `api-run-chart-mutants`).

## T2.1 — Esquemas e consultas do painel

- `trade-chart.validation.ts` e `trade-summary.validation.ts` espelham `/chart` e `/trade-summary` (decimais só como texto
  exato; `side` só `buy`/`sell`; `markers` e `clusters` anuláveis, como na API). `tradeSchema` ganhou `entryNotional`,
  `exitNotional`, `paid`, `received`, `fees` e `netProfitRate`, todos opcionais (aditivo: o contrato antigo continua válido).
- `trade-chart.query.ts`: `useTradeChartQuery` (`[runs, runId, 'chart', from, to, columns]`) e `useTradeSummaryQuery`
  (`[runs, runId, 'trade-summary']`); `useTradesQuery(runId, filters)` aceita `from`, `to` e `status` e os põe na chave.
  Todas sob a raiz `runs`, então o aviso do stream invalida as três.
- Teste: `test/trade-chart-queries.contract.tsx` (10 testes: esquemas aceitam o formato do servidor e recusam preço não
  decimal, lado desconhecido e campo ausente; resposta inválida vira erro de consulta e nada renderiza; query string com
  faixa/colunas/status; chave começa com `runs`). `test/support/render-app.tsx` ganhou a opção `probe` (renderiza um
  componente nos provedores, sem rotas) para testar hooks sozinhos.

## T2.2 — Fuso do usuário

- `src/format/zoned-time.ts`: `formatInZone(ms, fuso)` ("15/01/2026 12:30", `hourCycle: h23`), `zoneLabel(fuso, instante)`
  ("GMT−3" com o menos tipográfico, "GMT+5:30", "GMT" para UTC; o deslocamento vigente no instante, então muda com o horário
  de verão) e `resolveTimeZone` (nome IANA que o `Intl` não conhece cai em `America/Sao_Paulo`). Só `Intl.DateTimeFormat`
  (formatadores em cache por fuso), sem biblioteca.
- `src/account/useUserTimeZone.hook.ts`: lê `timezone` da consulta de perfil que o painel já tem (`useProfileQuery`).
  Desvio consciente do enunciado: enquanto o perfil carrega devolve `UTC` (spec D10, nunca hora sem dizer o fuso, e o rótulo
  sai "GMT"); depois, o fuso do usuário; perfil com erro ou fuso inválido, `America/Sao_Paulo`.
- Contratos: `test/zoned-time.contract.ts` (São Paulo fixo em GMT−3 o ano todo; Nova York 08/03/2026 07:00 UTC, 01:59 → 03:00
  e GMT−5 → GMT−4; 01/11/2026 06:00 UTC, 01:59 → 01:00 e GMT−4 → GMT−5; meia-noite 00:00; fuso inválido) e
  `test/user-time-zone.contract.tsx` (UTC enquanto carrega, fuso do perfil, inválido e erro caem no padrão).
- Achado nos gates: o `Intl` do Bun 1.4 escreve a data em pt-BR como "01/11/2026, 01:59" (vírgula) e o UTC como "GMT+0";
  por isso `formatInZone` monta o texto de `formatToParts` e `zoneLabel` aceita "GMT-03:00", "GMT-3" e "GMT+0" (zero vira
  "GMT"). Primeira rodada: 6 testes vermelhos por isso; segunda rodada verde.
- Gates (WSL, espelho `ativada-spec5`): `tsc` limpo, `eslint .` limpo, `prettier --check .` limpo, painel 418 testes verdes
  em 35 arquivos.

## T2.3 — Glossário

- `src/glossary/glossary.constant.ts`: as seis frases do RF13 (Sharpe, Sortino, Fator de lucro, Maior queda, Taxa de acerto,
  Slippage) num só arquivo, com chave estável (`GLOSSARY_TERM`) e rótulo; texto idêntico ao da spec.
- Contrato `test/glossary.contract.ts`: um termo por entrada da spec, frase de uma linha (sem quebra, termina em ponto, 20 a
  120 caracteres), nenhuma frase nem rótulo repetido, e duas frases conferidas literalmente.
- Gates (WSL, espelho `ativada-spec5`): `tsc` limpo (a primeira rodada acusou `string[]` contra o tipo literal no teste; corrigido),
  `eslint .` limpo, `prettier --check .` limpo, painel 422 testes verdes em 36 arquivos.

## T2.4 — Dica "?" do glossário

- `src/glossary/Term.component.tsx` + `useTermDisclosure.hook.ts` + `Term.module.css`: o rótulo que a tela já mostra seguido de
  um botão "?" com `aria-label="O que é <termo>?"`, `aria-expanded` e `aria-describedby` apontando para a frase
  (`role="tooltip"`, `hidden` enquanto fechada; o `[hidden]` do CSS vence o `display: block`). Abre por foco de teclado e por
  clique ou toque (o foco que o ponteiro causa antes do clique NÃO abre, senão o clique fecharia na hora); `Esc` em qualquer
  lugar e toque fora fecham; nenhum `focus()` é chamado, então o foco não se move. A frase aparece EM LINHA, abaixo do rótulo
  (não flutuante): em 375 px não corta nem cria rolagem horizontal. Alvo de toque 44 px (margem negativa mantém a linha
  compacta) e o `.trigger` entrou em `test/touch-targets.contract.ts`.
- Aplicação: `MetricRow` ganhou `term` opcional (Maior queda, Sharpe, Sortino, Taxa de acerto, Fator de lucro) e
  `MetricLabel` o desenha em `MetricsCard` e `CompareTable` (que usa as mesmas linhas); `CostsCard` envolve "slippage" no texto.
  O texto visível de cada rótulo não mudou.
- Contrato `test/term.contract.tsx` (12 testes): marcação e ligação por `aria-describedby`; foco abre e desfoca fecha;
  `Esc`; Enter/Espaço (chegam como clique); sequência de ponteiro (pressionar, focar, clicar abre; segundo toque fecha; toque
  fora fecha, toque na frase não); foco não é roubado; e nas três telas (cartão de resultado, comparação, custos) a frase aberta
  é igual à do glossário. Os testes existentes de `backtests.contract.tsx` seguem verdes.
- Gates (WSL, espelho `ativada-spec5`): `tsc` limpo, `eslint .` limpo (primeira rodada: `CompareTable` com 41 linhas e retornos
  sem tipo no hook; corrigido), `prettier --check .` limpo.
- Painel completo: 435 testes verdes em 37 arquivos.
