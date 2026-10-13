# CLAUDE.md

Contexto operacional do **AtivAdA**. Produto e regras em `README.md`,
`docs/spec/constitution.md` e nas specs em `specs/NNN-nome/`.

## Estado

Spec 001 em andamento (progresso real em `specs/001-simulador-e-sinais/evidence.md`). Prontos: Fase 0
(fundação), Fase 0b (contas, login, isolamento entre usuários, LGPD) e Fase 1 (candles da Binance:
backfill, Fear & Greed e stream ao vivo com recuperação de lacuna). Fase 2 (o motor em
`packages/strategy-engine`) com as métricas fechadas (T2.6-metricas); Fase 3 com backtest, walk-forward, as rotas REST (T3.4) a estratégia de exemplo por usuário (T3.5) e a fila durável de execuções com tetos por usuário (T3.6); Fase 4 com a simulação ao vivo no worker (T4.1), a paridade com o backtest (T4.2) e a sobrevivência do saldo (T4.3, piso e meta de dobro em `GET /v1/runs/:id`); tempo real com `LISTEN/NOTIFY` → WebSocket `GET /v1/stream` (T4.4) e o ticker público da Binance (T4.7); alerta de sinal no Telegram com caixa de saída durável e despachante com retry (T4.5) e registro cronológico em CSV (T4.6); Fase 4b com o motor de metas (T4b.1), o próximo gatilho (T4b.2), as rotas `/v1/goals*` com a avaliação em cache (T4b.3) e a simulação ao vivo atrelada a uma meta (T4b.4), o plano de operação (T4b.5), os alertas de preço (T4b.6 e T4b.7) e Seus ativos (T4b.8); Fase 5 do painel: T5.1 (app React/Vite PWA, login PKCE pelo token handler, aviso de simulação em toda rota), T5.1b (conta), T5.2 (visão geral com o crédito do Fear & Greed), T5.3 (backtests: criar, listar, detalhe com curva, comparar), T5.4 (estratégias: editar gera versão nova, duplicar, apagar, walk-forward) T5.5 (alertas e WebSocket `/v1/stream`), T5.6 (metas, ranking e cartão de meta ativa), T5.7 (plano com gráfico, quadro de alertas e Seus ativos) e T5.8 (preços ao vivo, selo "sem dados", sentimento com crédito); próximo passo: a revisão final da Fase 5 do `tasks.md`.

## Stack decidida

Monorepo Bun (workspaces) em TypeScript estrito:

```
apps/api-ativada/        Bun.serve — REST + WebSocket para o painel; backtest e walk-forward em worker_thread
apps/worker-ativada/     consome o stream de klines da Binance (grava velas fechadas, recupera lacunas), avalia estratégias, simula ordens
apps/cron-ativada/       one-shot agendado: exclusão de contas (Keycloak + dados, ADR 0001 §h), backfill de histórico e índice Fear & Greed
apps/frontend-ativada/   React 19 + Vite (PWA)
packages/database/      Drizzle + migrations (cada uma com .rollback.sql) + cliente Bun.sql
packages/environment/   validação Zod do env; `process.env` só em environment.ts (lint)
packages/identity-admin/ cliente da Admin API do Keycloak (API e cron o compartilham)
packages/market-data-crypto/    cliente REST de klines e stream WebSocket de klines da Binance (Zod, peso, retry, reconexão; cron e worker o compartilham)
packages/run-recording/  o que backtest e simulação ao vivo compartilham: o passo de candle (`advanceCandle`), as linhas que as decisões geram, o rastreio de posição e o mapeamento candle/sentimento
packages/strategy-engine/  indicadores, placar de votos, risco, corretora simulada, métricas —
                           o MESMO código roda no backtest e no ao vivo (contrato: ADR 0002)
```

Postgres + Drizzle. Keycloak 26.8.0 (OIDC) para login, realm em `realm/`; Mailpit v1.31.4 como SMTP de dev.
Docker Compose único na raiz. `make up` sobe Postgres, Keycloak e Mailpit; `make identity-test` verifica
realm, permissões e reuso de refresh (resultados no ADR 0001 §l). Portas dev: Postgres 56432, Keycloak
56180, Mailpit SMTP 56125 / UI 56126; teste: 56433, 56181, 56127 / 56128.
`Makefile` com `PROJECT_NAME`. Env em `envs/`.

**Multiusuário.** Cada usuário tem login, estratégias, simulações, alertas e (na spec 002) chave de
corretora próprios. Candles e sentimento são compartilhados. Preview da tela em
`docs/preview/dashboard.html`.

## Infraestrutura local e testes

- **O import do realm não altera um realm existente.** Mudou `realm/*.json`? Aplique com
  `make down DOWN_FLAGS=--volumes` e `make up` (apaga os dados do Keycloak daquele ambiente). `make up`
  avisa quando o JSON é mais novo que o volume.
- **Simulação ao vivo de 72 h (T6.3, `docs/runbook-live72.md`).** Alvos `make live72-up` (idempotente: infra dedicada `ativada-live72`
  em `envs/env.live72`, portas 565xx, migrations, LaunchAgent `com.adatechnology.ativada-live72`, usuário de teste, backfill),
  `live72-start` (meta e UMA simulação `live_paper` pela API autenticada; grava `~/.ativada-live72/run.json`),
  `live72-status`, `live72-report` (grava `report.md` com o veredito do critério 4), `live72-stop` (descarrega o agente, mantém os dados) e
  `live72-down CONFIRM=1` (apaga agente, containers, volumes e `~/.ativada-live72`). Código em `scripts/live72/` (o supervisor, o
  sumidouro do Telegram e a parte pura do relatório, com contrato em `test/live72-*.contract.test.ts`). Estes alvos NÃO sobem uma infra
  descartável: os dados persistem até o `down`. O notebook precisa ficar ligado e na tomada; sem `TELEGRAM_BOT_TOKEN` o worker não
  enfileira alerta, então a infra usa token e chat falsos com um sumidouro local (o Telegram real nunca é chamado).
- Alvos `*-test` (`migration-test`, `database-test`, `identity-test`, `session-test`, `admin-test`,
  `lgpd-test`, `backfill-test`, `stream-test`, `backtest-test`, `walkforward-test`, `api-runs-test`, `api-runs-mutants`, `example-mutants`, `queue-test`, `queue-mutants`, `live-test`, `live-mutants`, `stream-api-test`, `stream-mutants`, `alert-mutants`, `runlog-mutants`, `telegram-test`, `telegram-mutants`, `goals-test`, `price-alerts-test`, `price-alert-mutants`, `user-asset-mutants`, `db-outage-test`, `stall-mutants`, `panel-e2e`) sobem uma infra descartável em `ENV=test` e a derrubam com `--volumes` em `EXIT`, `INT` e
  `TERM`: Ctrl-C não deixa container vivo. Dois deles ao mesmo tempo disputam o mesmo projeto; rode um por vez.
- `make check` roda `bun test` com `env -i`: teste que precisa de variável a declara; o `export` do `env.dev`
  não chega a ele.
- **Motor de estratégias (ADR 0002, revisado na T2.1b).** `step ≡ walletStep ∘ signalStep`, puro (sem relógio,
  aleatoriedade, locale nem I/O; o teste de fronteira varre o `src` com sonda), estado JSON canônico versionado em
  duas partes (sinal e carteira); decimal (`decimal.js`) nunca aparece no estado nem nas decisões, só texto. A
  versão da estratégia é só a lógica (`configHash`); par, timeframe, saldo, taxa, slippage, filtros e participação
  no volume são `RunParameters` (`runHash`). A entrada guarda o VALOR EM RISCO e a quantidade nasce no
  preenchimento (perda no stop sem gap ≤ `riskPerTrade × saldo`). Recusa de entrada tem `EngineInputError.code`
  estável (`CANDLE_ALREADY_PROCESSED` na retomada = pular). Sentimento entra por `observedAt` = disponibilidade;
  lacuna para a frente só com `confirmedGapCandles` exato. Todo motor novo passa `runEngineContract` (21
  verificações, 10 cenários) e todo indicador passa `expectIndicatorContract` (`test/fixtures/strategy-engine/`); a
  referência e 33 motores defeituosos provam o harness. Os checks de corte (`no-lookahead`, `resume`) são amostrados
  por padrão; `make contract-full` (ou `bun run test:full`, `FULL_CONTRACT=1`) roda todo corte. `zod@4.6.5` e `decimal.js@10.6.0` exatos e diretos; o
  hash da versão é preso por teste de hash-dourado literal.
- **Risco (T2.4, ADR 0002 §"Risco em produção").** `computePositionSize` é o ÚNICO dimensionamento do produto (a
  spec 002 o reutiliza no envio da ordem): quantidade pelo valor em risco com a folga de arredondamento
  descontada antes de dividir (perda no stop sem gap < `riskAmount`, débito < caixa), limitada por exposição,
  caixa e participação no volume do candle de DECISÃO `t` (a ordem pendente guarda `decisionVolume`; nunca o
  volume de `k`). `maxExposureRate` é teto POR CARTEIRA; o teto TOTAL entre pares NÃO é do motor, é do RiskGuard
  da execução real (spec 002) e da camada de metas. `warnRunParameters` devolve avisos (tick que domina o
  slippage, passo que zera ou engrossa a quantidade, mínimo acima do saldo). Provado por diferencial de 6.000
  cenários contra o oráculo independente em `test/fixtures/strategy-engine/risk/` e por 18 mutantes.
- **Motor em produção (T2.5, ADR 0002 §"Motor em produção").** `createEngine()` (`engine-2`) = `signalStep ∘
  walletStep`; a corretora simulada mora em `packages/strategy-engine/src/wallet/` (`simulatedFillModel`, política de
  sinal e comandos, régua, patrimônio com `equityAtLow`). O `walletStep` AVULSO confere hashes (o sinal carrega
  `configHash` e a lacuna ecoada; o estado da carteira carrega `configHash` e `runHash`) e a contiguidade do candle;
  mexer no sinal ou nessa guarda exige `SIGNAL_ENGINE_VERSION`/`ENGINE_VERSION` novos e o dourado regravado
  (`test/fixtures/strategy-engine/golden/`). Prova: diferencial byte a byte contra a referência em 3.000 fluxos,
  propriedades, harness de 21 verificações no motor completo e 51 mutantes de produção
  (`test/production-engine-mutants.contract.test.ts`).
- **Revisão da Fase 2 (T2.6, ADR 0002 §"Revisão da Fase 2").** `equityAtLow` é o vale: o menor entre a posição que
  existiu durante o candle valorada na mínima (inclui a que sai pelo ALVO no candle; stop, venda pendente e lacuna
  não contam) e o patrimônio ao fim do passo. O motor RECALCULA `configHash`/`runHash` (um SHA-256 por objeto) e
  confere que sinal e carteira estão no mesmo candle. Lacuna confirmada: stop assumido tocado, a posição sai na
  abertura pós-lacuna (`exitReason: gap`), pendências caducam (`reason: gap`), nenhuma entrada nesse candle.
  `exit_position` e `halt` suprimem a entrada do próprio candle; `commandId` é idempotente entre passos (últimos 64 em
  `wallet.processedCommandIds`; repetido sai como `ignored_duplicate`). A aritmética de dinheiro vive só em
  `src/money.ts`. `RunParameters` aceita no máximo 8 casas em dinheiro, taxas e filtros; `warnRunParameters` avisa de
  taxa e slippage zero. O oráculo `bigint` (`test/fixtures/strategy-engine/oracle-bigint/`, sem importar `src` nem
  `reference-*`) replica caixa, lucro e patrimônio dos preenchimentos e confere harness, diferencial e conjuntos reais.
  Na carga histórica de sentimento `created_at` é o instante ESTIMADO de publicação, nunca o da carga (T3.1).
- **Métricas (T2.6-metricas, ADR 0002 §"Métricas").** `computeRunMetrics({ equityPoints, closedPositions, openPosition, run })`
  em `packages/strategy-engine/src/metrics/` (`METRICS_VERSION = 'metrics-1'`): puro, decimal exato, sem `Math.exp/log/pow`
  (potência e raiz são `EngineDecimal.pow/.sqrt`). Tudo sai em TEXTO; derivado de divisão/raiz/potência é arredondado UMA
  vez a 12 casas, soma de dinheiro é exata; o que não se define é `{ value: null, reason }`, nunca `NaN`. Sharpe usa `n−1`
  e anualiza por √(365,25 dias ÷ timeframe); Sortino usa o desvio de queda sobre TODOS os períodos; `maxDrawdownAtLow` (pico =
  máximo corrente do fechamento) é o relatório honesto e o das metas; anualizado e operações por ano são `null` abaixo de
  30 dias; `feesPaid` inclui a taxa da posição aberta; `reconcileRunMetrics` exige em decimal exato que realizado + não
  realizado = patrimônio final − saldo inicial. Mudar fórmula exige `metrics-2` e o dourado regravado
  (`bun run scripts/record-metrics-golden.ts`). Prova: contas à mão, 2.000 séries de propriedades, dourado dos dois conjuntos
  reais, 31 mutantes (`test/metrics-mutants.contract.test.ts`) e o oráculo Python
  `test/fixtures/strategy-engine/oracle/metrics_reference.py` (uso no ADR; não roda na CI).
- **Persistência de estratégias e execuções (T3.1, ADR 0002 §"Persistência (T3.1)").** `strategies`, `strategy_versions`,
  `runs` (0007) e `signals`, `orders`, `fills`, `positions`, `equity_points`, `run_commands`, `sentiment_observations`
  (0008), em quatro repositórios (`createStrategyRepository`, `createRunRepository`, `createRunResultRepository`,
  `createSentimentObservationRepository`). Dono em toda tabela, FK composta `(pai_id, user_id)` e `ON DELETE RESTRICT`;
  o resultado grava em LOTE (`append*`: uma transação, blocos ≤ 5.000 linhas e < 60.000 parâmetros, idempotente por
  chave natural; `orders` e `positions` com upsert de status monotônico, `signals`/`fills`/`equity_points`/`run_commands`
  com `DO NOTHING`). Versão de estratégia = hash da configuração: hash igual devolve a mesma versão. Valores do motor são
  `numeric` sem precisão e `jsonb` só aceita objeto/lista (`sql.param(valor)::jsonb`); o cursor de `runs` leva
  `created_at::text` (microssegundos). `sentiment_observations` é pública e imutável por GATILHO (UPDATE, DELETE e
  TRUNCATE), com `created_at` = instante em que o valor ficou conhecido. Prova: `make database-test` (lote sintético de
  17.520 + 4.000 + 300 em ~1 s, monotonicidade, isolamento, FK composta, paginação), `make lgpd-test` (exportação e
  purga das 10 tabelas) e os contratos `strategy-persistence-schema` e `ownership-registry`.
- **Backtest em `worker_thread` (T3.2, ADR 0002 §"Backtest em `worker_thread` (T3.2)").** `apps/api-ativada/src/backtest/`:
  `runBacktest({ database, runId })` é o caso de uso (porta `BacktestDatabase`, adaptador `createBacktestDatabase`; o escopo
  do dono nasce em `attach` por `resolveRunOwnerScope`, SÓ para `runId` enfileirado pela API) e `backtest.worker.ts` +
  `backtest-thread-runner.ts` rodam na thread (Bun `Worker`, `{ runId }` e eventos `z.strictObject`, timeout
  `BACKTEST_TIMEOUT_SECONDS` padrão 900, `terminateAll()` no encerramento). Cada lote de 2.000 passos é UMA transação
  (`createRunBatchRepository.runInBatch`: status → resultados → checkpoint, com a execução travada); cancelamento é lido
  dentro dela; falha vira `failed` com código estável e NUNCA leva o texto do erro; lacuna do banco é declarada ao motor;
  retomada do checkpoint dá o resultado da execução contínua. Métricas saem do que ficou gravado
  (`computeOpenPositionMetrics` fecha a posição aberta). Prova: contratos em memória (`test/backtest-*.contract.test.ts`),
  28 mutantes (`test/backtest-mutants.contract.test.ts`) e `make backtest-test` (17.520 candles ~3,4 s de ponta a ponta;
  determinismo, paridade com o motor direto, golden dos dois conjuntos reais, isolamento, cancelamento, thread que morre,
  timeout, órfã retomada e `/v1/health` < 100 ms). Teste novo em `test/backtest-*` que carregue o módulo usa
  `loadBacktestApi()`: é por ele que os mutantes entram.
- **Walk-forward (T3.3, ADR 0002 §"Walk-forward (T3.3)").** Domínio PURO em `packages/strategy-engine/src/walk-forward/`
  (janelas em meses de calendário UTC sem `Date`, catálogo FECHADO de caminhos ajustáveis, teto de 200 combinações
  VÁLIDAS, seleção por Sharpe do AJUSTE com `minTradesPerWindow`, encadeamento do patrimônio, `detectOverfitting`) e execução
  em `apps/api-ativada/src/walk-forward/`: `runWalkForward({ database, runId, options })` (porta `WalkForwardDatabase`,
  `createWalkForwardDatabase`), busca por combinação em até `WALK_FORWARD_THREADS` threads (`search.worker.ts`, mensagens
  `z.strictObject`; o resultado NÃO depende do número) e a coordenadora `walk-forward.worker.ts` +
  `walk-forward-thread-runner.ts` (a mensagem leva só o `runId`: o pedido — grade e janelas — mora em `runs.request` desde a T3.4 e entra no checkpoint por hash). O sinal
  sai UMA vez por combinação da série contínua e a carteira roda por janela (`walletStep` avulso, chaves `w<i>:`);
  o relatório principal (`runs.metrics`) é o FORA DA AMOSTRA concatenado e `metrics.overfitting` guarda o alerta. Cada
  janela grava a linha de `walk_forward_windows`, os resultados do teste e o checkpoint na MESMA transação
  (`commitUnit`); a busca checkpointa por combinação. Prova: contratos (`test/walk-forward-*.contract.test.ts`, em memória
  e com threads de verdade), 28 mutantes do domínio e 18 da execução, paridade com o motor completo por janela
  (sintético e os dois conjuntos reais) e `make walkforward-test`. Teste novo que carregue o módulo usa
  `loadWalkForwardApp()` / `loadWalkForwardEngineApi()`: é por eles que os mutantes entram.
- **Rotas REST de mercado, estratégias e execuções (T3.4, ADR 0002 §"Rotas REST…").** `apps/api-ativada/src/{markets,strategies,runs}/`
  (rotas `create*Routes`, casos de uso com repositório injetado, `*.docs.ts` com a documentação OpenAPI da rota) e
  `openapi/` + `docs/` (documento gerado da tabela; `/v1/openapi.json` e `/v1/docs` só fora de produção, Scalar `1.72.1` com
  SRI e CSP própria). **Toda rota nova declara `access` E `documentation`** (o gerador recusa rota sem ela e o contrato
  `api-openapi` reprova a tabela). `POST /v1/runs` despacha pela porta `RunDispatcher` (`runs/run-dispatcher.ts`; a
  implementação padrão não tem teto: **a T3.6 troca `createApplicationRunners`**) e grava o pedido do walk-forward em
  `runs.request`. Recurso alheio, inexistente ou id malformado dão o MESMO `404` (UUID só em minúsculas); validação devolve
  todos os erros sem eco de valores; listas por cursor com `limit` ≤ 100; CSV em fluxo com proteção contra injeção de
  fórmula. Teste novo de rota usa `loadApiApp()` (`test/fixtures/api-routes/`) e os repositórios em memória de
  `test/fixtures/api-routes/`: é por eles que os mutantes entram. Prova: contratos `test/api-*.contract.test.ts`, 36 mutantes
  da API (`api-routes-mutants`), `make api-runs-mutants` (11 filtros de dono removidos contra Postgres) e
  `make api-runs-test` (API de verdade: estratégia → backtest → séries → CSV → walk-forward → parada → isolamento).
- **Estratégia de exemplo (T3.5, ADR 0002 §"Estratégia de exemplo (T3.5)").** `CLASSIC_SCOREBOARD_STRATEGY` (pacote do motor) é a
  fonte ÚNICA do Placar clássico; o fixture de teste só a confere por hash. Todo usuário recebe UMA cópia editável (`is_example`)
  no primeiro acesso: `createExampleSeedingUserResolver` (decorador do `UserResolver`) chama `seedExampleStrategy`, que num
  `UPDATE` condicional da MARCA `users.example_strategy_seeded_at` (migration 0011) cria estratégia e versão 1 na mesma
  transação; apagar, renomear ou editar não a traz de volta, falha desfaz a marca e NUNCA derruba o acesso. Todo teste novo de
  API/LGPD que conte estratégias de um usuário que passou pela API conta o exemplo. Prova: `make database-test`,
  `make example-mutants` (6 mutantes no Postgres) e `test/example-strategy*.contract.test.ts`.
- **Fila de execuções (T3.6, ADR 0002 §"Fila de execuções (T3.6)").** A fila é o banco: `POST /v1/runs` grava `queued` e o despachante
  (`runs/queue/run-queue-dispatcher.ts`, que SUBSTITUIU o despachante direto da T3.4 em `create-application.ts`) reivindica a próxima
  elegível com `createRunQueueRepository(...).claimNextRun` (round-robin entre usuários por `max(started_at)`, tetos por usuário e tipo de
  `users.limits`, `FOR NO KEY UPDATE SKIP LOCKED` no dono e `FOR UPDATE SKIP LOCKED` na execução) e a entrega à `worker_thread`. Teto global
  da instância `RUN_GLOBAL_CONCURRENCY`; fila por usuário `RUN_QUEUE_PER_USER_LIMIT` (429 `RUN_QUEUE_FULL`); simulação ao vivo acima do teto
  409 `LIVE_RUN_LIMIT_REACHED`. `runs.claimed_by` + `heartbeat_at` (migration 0012): a instância renova o batimento a cada
  `RUN_HEARTBEAT_INTERVAL_SECONDS`; órfã (vencido por `RUN_HEARTBEAT_TIMEOUT_SECONDS`) com checkpoint volta à fila e retoma, sem
  checkpoint vira `failed`/`ORPHANED` (`RUN_ORPHAN_POLICY=fail` falha todas); `stop()` no SIGTERM devolve as `running` da instância à
  fila. Conta bloqueada ou apagada não é reivindicada e as `running` dela são canceladas. `GET /v1/runs/:id` traz `queuePosition`
  (`{ own, overall }`, só números) e `/v1/admin/health` traz `runs` (contagens agregadas). A regra de reivindicação é função PURA em
  `packages/database/src/run-queue/claim-policy.ts`. Teste novo da fila usa `loadApiApp()`; teste do banco entra em
  `packages/database/test-support/run-queue-*.ts`. Prova: contratos, `make database-test`, `make queue-test` (duas instâncias reais, queda
  e retomada idêntica) e `make queue-mutants` (14 mutantes do banco) mais 20 mutantes da API (`test/run-queue-mutants.contract.test.ts`).
- **Simulação ao vivo (T4.1, T4.2, ADR 0002 §"Simulação ao vivo (T4.1 e T4.2)").** SÓ o worker avalia (`apps/worker-ativada/src/live/`): `createLiveEvaluator(...).tick()`
  cancela as de conta inativa, renova o batimento, reivindica (`createLiveRunRepository(...).claimLiveRuns`: `claimed_by` + batimento, teto
  `maxActiveLivePaperRuns` por usuário sob `SKIP LOCKED`, assume a de worker caído) e avalia cada uma detida sem que uma derrube outra.
  Um passo por candle fechado = UMA transação (linhas + `engine_state` + `last_candle_time`); o estado vem sempre do checkpoint (nada em
  memória entre rondas), então reiniciar nunca duplica operação nem sinal. O passo é `advanceCandle` (`@ativada/run-recording`), o MESMO do
  backtest: mexer nele muda os dois. Candle repetido é pulado; buraco espera a recuperação do stream e só vira lacuna (posição fechada,
  motivo `gap`) quando ela o marcou como inalcançável (`unfillable`); FK violada/execução sumida = encerrada sem erro; erro de banco repete,
  erro tipado grava só o código (nunca o texto). `POST /v1/runs` com `live_paper` NÃO leva período (começa no candle em curso, sem fim); o
  agendador (`LIVE_POLL_SECONDS` 5, `LIVE_HEARTBEAT_TIMEOUT_SECONDS` 60) roda uma ronda por intervalo e uma por candle gravado. Teste novo do
  avaliador usa `loadLiveApi()` (`test/fixtures/live/`): é por ele que os 33 mutantes entram. Prova: 54 contratos, `make live-test` (Postgres
  descartável, API real, worker em processo à parte morto por SIGKILL, paridade com o backtest nos dois conjuntos reais, ~3 ms por passo),
  `make live-mutants` (6 mutantes do adaptador) e `make queue-mutants` (+10 da reivindicação ao vivo).
- **Sobrevivência do saldo (T4.3, ADR 0002 §"Sobrevivência do saldo (T4.3)").** `computeBalanceSurvival` (`packages/strategy-engine/src/survival/`,
  `survival-1`) é PURA: piso = `ceil8(saldo × floorRate)` (padrão 0,8) e meta = `ceil8(saldo × doubleRate)` (padrão 2), ambos para cima; piso
  atingido quando `equityAtLow <= piso` (o vale), dobro quando `equity >= meta` (o fechamento); o tempo vai do início da simulação ao
  FECHAMENTO do candle do marco (`null` enquanto não atingido, com o progresso arredondado contra o usuário e `1` só se atingido); pontos do
  aquecimento não contam. A configuração mora em `runs.request.survival` (só `live_paper`, validada na criação); `GET /v1/runs/:id` lê a curva
  por páginas e devolve `survival` (`null` nos outros tipos); a lista não traz o campo. Teste novo usa `loadSurvivalApi()`
  (`test/fixtures/strategy-engine/survival/`): é por ele que os 23 mutantes entram; o oráculo `bigint` do teste não importa o `src`.
- Código que só os testes de integração usam fica em `packages/<pacote>/test-support/` (pode imprimir); `src`
  não tem `console`.
- **Admin só pelo grupo `admins`.** O grupo carrega o papel `admin` e está fora do alcance da service account
  (ADR 0001 §q). Atribuir o papel direto, sem o grupo, deixa a conta sem essa proteção.
- O cron (`apps/cron-ativada`) roda quatro tarefas em sequência e sai `1` se qualquer uma falhar:
  `purge-deleted-accounts`, `reconcile-blocked-accounts`, `expire-audit-events`, `backfill-candles`.
  `CRON_TASKS` (lista separada por vírgula) roda só as nomeadas. O backfill percorre cada par
  (`MARKET_SYMBOLS` x `MARKET_TIMEFRAMES`, padrão BTCUSDT/ETHUSDT em 15m/1h/4h/1d) em sequência, acha as
  lacunas em SQL (`findMissingOpenTimes`), baixa só o que falta e grava cada página ao chegar; `BACKFILL_YEARS`
  (1 a 5, padrão 2) e `BINANCE_BASE_URL` (padrão `https://data-api.binance.vision`, https em produção).
  Lacuna que a Binance não tem sai no log como `unfillable`, sem laço de retry. Um 418 (ban de IP) aborta a
  execução do backfill (saída 1, com o fim do ban no log) em vez de passar ao próximo par. `make backfill-test` prova
  isso com o cron real, Postgres descartável e uma Binance falsa local.
- O worker (`apps/worker-ativada`) roda de verdade: abre o banco, consome o stream combinado de klines
  (`createKlineStream`, `packages/market-data-crypto`) e grava só velas fechadas (`x === true`) com `upsertCandles`
  (idempotente, não atualiza: vela fechada é imutável). A verificação de lacunas cobre uma JANELA DE RETROCESSO,
  `[agora - STREAM_GAP_LOOKBACK_HOURS, última vela fechada)`, não "a partir da última gravada": roda em CADA
  (re)conexão e a cada `STREAM_GAP_CHECK_MINUTES` (SQL barato; só vai ao REST se houver lacuna). Par sem nenhum
  candle fica para o backfill do cron; buraco que a Binance não tem e que passou de 24 h não é pedido de novo.
  Escrita que falha repete 3 vezes com backoff e, se persistir, dispara a verificação por janela. Erro de
  gravação é logado (id opaco) e não derruba o worker; 418 faz dormir o `Retry-After` (teto 24 h) em fatias e a
  recuperação não segue pelos pares seguintes; SIGTERM/SIGINT cancelam (AbortSignal) a recuperação em curso e
  encerram de forma graciosa (saída 0). A hora vem do servidor (`createServerClock`, `GET /api/v3/time`; falha
  cai no relógio local com aviso); o repositório só rejeita vela com `closeTime` além de agora + 5 s. Variáveis:
  `MARKET_EXCHANGE` (só `binance`), `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BINANCE_BASE_URL` (REST),
  `BINANCE_STREAM_URL` (padrão `wss://data-stream.binance.vision`, `wss://` em produção), `STREAM_STALE_SECONDS`
  (5 a 600, padrão 60: sem mensagem por esse tempo, reconecta), `STREAM_GAP_LOOKBACK_HOURS` (1 a 720, padrão 168)
  e `STREAM_GAP_CHECK_MINUTES` (1 a 1440, padrão 15). `make stream-test` prova isso com o worker real em subprocesso, Postgres
  descartável e uma Binance falsa local (REST + WebSocket em `packages/market-data-crypto/test-support/`).

## Painel (`apps/frontend-ativada`)

React 19 + Vite 8 + react-router 8 + TanStack Query 5, sem biblioteca de UI e sem plugin de PWA (o `public/sw.js` é à
mão e não cacheia `/v1`). Detalhe e decisões em `specs/001-simulador-e-sinais/plan.md` §5d.

- **O token nunca toca o disco do navegador.** Access token só em memória (`SessionService`); refresh no cookie
  `__Host-` HttpOnly da API. Renovação de uma por vez; 401 renova uma vez e repete. `localStorage` guarda só o tema.
  Resposta de 429/5xx/rede na renovação é `unavailable` (tentar de novo), não logout.
- **Toda resposta da API é validada por Zod no cliente**; o painel não importa código de outra app, então os
  esquemas em `src/**/*.validation.ts` espelham os contratos de `GET /v1/openapi.json` (fora de produção). Mudou o
  contrato da API, mude o esquema do painel e o contrato de `test/`.
- **Estilo do código.** Componente de função ≤ 40 linhas e arquivo ≤ 200 (o lint vale para `.tsx`); sem `as`, sem
  `any`, sem `default export` (exceção nomeada só para `vite.config.ts` e `playwright.config.ts`, que o Vite/Playwright
  exigem); `import.meta.env` e `process.env` só em `src/environment.ts` (e no leitor do E2E). CSS Modules + tokens em
  `src/styles/global.css`; sem estilo inline. Tipos de `*.module.css` vêm de `vite/client` (com
  `noUncheckedIndexedAccess` a classe é `string | undefined`; só `className` e template string aceitam isso).
- **Testes.** `bun run --cwd apps/frontend-ativada test`: arquivos `test/*.contract.ts(x)` (NÃO `.test.`/`.spec.`, para
  o `bun test` da raiz e o Playwright não os pegarem), lista EXPLÍCITA no script `test` do `package.json` (teste novo não
  roda se não entrar ali), preload `register-dom.ts` (happy-dom), `setup.ts` e o stub de CSS Modules. A API é um
  `fetch` falso por rota (`test/support/fake-fetch.ts`); `renderApp` monta o app inteiro com roteador em memória.
  `make check` roda esse script. `make panel-e2e` sobe infra descartável, constrói o painel, serve com `vite preview`
  na porta do `KEYCLOAK_PANEL_ORIGIN` e roda o Playwright (`e2e/*.e2e.ts`, Chromium em cache do Playwright 1.58).
- **Typecheck próprio.** `tsconfig.json` do painel tem `lib` com DOM e `jsx`; o da raiz o exclui. `bun run typecheck`
  roda os dois.
- **Env público** (`envs/env.*`): `VITE_API_URL` (alvo do proxy), `VITE_KEYCLOAK_AUTHORIZE_URL`, opcionais
  `VITE_KEYCLOAK_CLIENT_ID` e `VITE_MARKET_SYMBOLS`, e `PANEL_PORT` (porta de `vite`/`vite preview`, só do `vite.config.ts`).
- **Tempo real (`src/live/`).** `StreamClient` é puro (socket, temporizador, relógio e sorteio entram por parâmetro, então os
  testes não dormem): ticket de uso único, renovação dentro do socket, reconexão com espera crescente, `4401` reconecta na
  hora, `4403` para, `resync` rebusca por REST. Quem liga a tela ao socket é `useLiveStream` (no `AppShell`), e o aviso só
  invalida as consultas do assunto (`runs` ou `price-alerts`): o REST continua sendo a fonte da verdade. Consulta que o aviso
  deve refazer fica sob a chave raiz `runs` ou `price-alerts`.
- **Lista, polling e cursor.** Listas usam `useInfiniteQuery` (botão "Carregar mais"); execução na fila ou rodando é
  acompanhada por `refetchInterval` (`runPollMilliseconds` em `AppConfig`, 2 s; os testes usam 20 ms). A curva inteira vem do
  CSV do registro, nunca de dezenas de páginas.
- **Editor de estratégia.** Os campos saem da própria configuração (`config-leaves.ts`): só número e decimal, com o tipo
  preservado, e rótulos em `leaf-labels.ts`. O catálogo do walk-forward é espelhado ali (`STATIC_TUNABLE_KEYS`, `RULE_FIELDS`):
  mudou o catálogo do motor, mude lá também (a API recusa com `400` o que ficar de fora).
- **E2E ampliado.** `make panel-e2e` agora cria backtests pela tela e a API os roda de verdade (candles diários do seed),
  compara, edita estratégia, e recebe sinal e alerta de preço pelo WebSocket: o servidor de controle do harness
  (`scripts/panel-e2e/control-server.ts`) só grava a linha no banco e dá o `pg_notify` que o worker e o ticker dariam; todo o
  resto é o caminho de produção. O limite de 10 renovações de sessão por minuto vale no E2E: navegue por links, não por
  `page.goto`.
- **Metas, plano e ativos (`src/goals/`, `src/assets/`).** Rotas `/metas`, `/metas/:goalId`, `/metas/:goalId/plano`, `/ativos`.
  Porcentagem do formulário vira fração movendo a vírgula no TEXTO (`percentToFraction`): nunca `Number` em valor que vai à
  API. O ranking é HISTÓRICO e a tela diz isso; COMPRAR/SEGURAR/EVITAR não é recomendação. "Simular esta meta" só existe para o
  par da meta (a API recusa outro). Campo que o motor devolve nulo (taxas de janela vazia, leitura de sentimento) tem texto
  próprio. O gráfico do plano é SVG à mão (`plan-chart.ts` é a escala pura). **Sem fonte de câmbio:** a cotação USDT→R$ é
  digitada pelo usuário e guardada só no `localStorage`. A regra do dia dos ativos exige `strategyId` na consulta (a API não
  adivinha a estratégia); o painel manda a primeira da lista até o usuário escolher.
- **Preços ao vivo (`src/live/`).** `MarketStore` + `useSyncExternalStore`: o tick por par re-renderiza só quem lê o preço.
  `computeMarketState` (`live`/`waiting`/`stale`/`offline`) alimenta o selo e o REST de reserva (15 s) dos cartões de moeda e do
  resumo de ativos. Hooks: `useShownPrice` (tick vivo, senão REST) e `useLivePrice` (só o tick em dia; senão o preço do servidor).
- **E2E de tempo real.** O harness sobe uma Binance falsa (`packages/market-data-crypto/test-support`), liga o ticker da API nela e o
  servidor de controle ganhou `POST /tick {symbol, price}`: o preço entra pela Binance falsa e o resto (agregação, alerta de
  preço, WebSocket, painel) é o caminho de produção. A série diária do seed usa `DAILY_SEED = 7` porque o plano precisa de
  compra alcançável (com a semente antiga a compra era "inalcançável" e não havia alvo nem stop). Derrubar o socket é feito
  com `page.routeWebSocket` numa segunda aba da mesma sessão.
- **Revisão da Fase 5 (preços, sessão, dinheiro).** (1) A idade do preço é POR PAR (`isPriceFresh`, janela de 10 s; `silenceMilliseconds`
  em `AppConfig` só para teste): par mudo cai para o REST de reserva (15 s) e o `CoinCard` diz "Ao vivo · há N s" ou "Sem dados há N s".
  (2) Falha transitória na renovação com o token ainda válido mantém a sessão e mostra aviso (`hasRenewalProblem`); só o token vencido
  sem renovação troca o `Outlet`. Um contador de geração impede refresh lento de desfazer um login. Sair que o servidor não confirma
  avisa na tela de login. (3) O índice de versões distingue carregando, indisponível e removida (`allSettled`, paginação). (4) Dinheiro no
  navegador é `BigInt` de escala 8 (`src/format/decimal.ts`), com o arredondamento do servidor (valor para baixo, custo para cima, taxa
  para baixo); `test/panel-asset-math.contract.test.ts` (raiz) compara o painel com a API em 400 casos sorteados. Resumo e total em R$
  saem dos mesmos números vivos dos cartões. (5) Valor numérico da API é validado como texto decimal (`decimalText`): nada de `NaN` na tela.
  (6) O selo de preços anuncia ao leitor de tela só a troca de estado, não os segundos. (7) O prazo da meta usa os presets da RF13
  (7, 14, 30, 60, 90 dias). (8) `--buy` e `--bench` têm teste de contraste (≥ 4,5:1) nos dois temas.
- **Operações no gráfico (spec 005, `src/runs/`).** `TradeChartCard` ("Preço e operações") é o cartão do detalhe do backtest, do walk-forward e da `live_paper`: aviso (`TradeNotice`), resumo (`TradeSummary`), controles de período, gráfico SVG (`PriceChart`) e tabela virtual (`TradesTable`, ≤ 60 `<tr>`). A seleção mora na URL: `?de=&ate=` (faixa) e `?operacao=<chave>` (a mesma chave da seta e da linha); seta e linha se selecionam nos dois sentidos. Horas no fuso do usuário (`useUserTimeZone`) com o deslocamento ao lado ("GMT−3"); os campos de data são UTC. Os "?" vêm do glossário fechado (`src/glossary/`, componente `Term`): termo novo exige entrada ali. Ao vivo o gráfico mostra SÓ vela fechada: sem faixa na URL ele acompanha o fim (o aviso do stream refaz a consulta), com faixa fica fixo e aparece "Há velas novas — ir para o fim". Dinheiro do resumo é `BigInt` e arredonda na direção da frase do servidor (`roundScaledDirected`). Contraste do gráfico (setas, linha, halo) a 3:1 em `test/contrast.contract.ts`. O `/chart` devolve `runRange` (a faixa efetiva da execução): o painel recorta por ela a faixa da URL, os atalhos e o deslocamento. As setas são uma parada de Tab só (tabindex de passagem, ←/→/Home/End).
- **Limites conhecidos.** O histórico de sinais
  lê páginas de 100 (decrescentes) e esconde o neutro: com muito neutro seguido, "Carregar sinais mais antigos" é preciso.

## Regras que não se negociam

- **Nenhuma ordem real sem uma pessoa ligar o modo `live`.** A I.A. nunca arma o modo real, nunca
  manuseia chave de API real e nunca executa ordem com dinheiro de verdade.
- Dinheiro e quantidade de moeda são decimais (`numeric` no banco, `decimal.js` no código). Float
  só dentro do cálculo de indicador.
- **Sem lookahead**: decisão no fechamento do candle `t`, execução na abertura de `t+1`. Teste de
  contrato prende isso.
- Backtest e simulação ao vivo usam o mesmo `packages/strategy-engine`. Lógica duplicada entre os
  dois é defeito.
- `userId` vem só do token. Repositório de recurso de usuário exige `userId` no tipo; recurso de
  outro usuário responde `404`. Toda rota nova nasce com contrato negativo entre usuários.
- Chave de corretora do usuário é só escrita, cifrada fora do alcance da chave do banco, e cada
  usuário arma a própria execução.
- Toda decisão (sinal, motivo, ordem, preenchimento) fica registrada.
- Chave, token e segredo nunca em log, commit ou terminal.
- **Tamanho do código é imposto pelo lint** em `apps/*/src` e `packages/*/src` (testes, `scripts/` e `test-support/`
  ficam de fora): função com no máximo 40 linhas, arquivo com no máximo 200 (ambos sem linhas em branco e comentários) e
  3 parâmetros por função (acima disso, um objeto tipado). É erro, não aviso. A única forma de burlar é uma exceção
  nomeada: um override por arquivo em `eslint.config.js`, com arquivo, função e motivo em um comentário de uma linha.
  `eslint-disable` não funciona (`noInlineConfig`). Hoje há zero exceções. `test/code-size-limits.contract.test.ts` prova
  cada regra por sonda e por mutação do limite.
- Uma task por vez, tirada do `tasks.md`. Task só fecha com evidência em `evidence.md`.
- **Tempo real (T4.4 e T4.7, ADR 0001 §r e ADR 0002 "Tempo real").** O `Bun.SQL` 1.3.14 NÃO tem `listen`/`notify` (os tipos mentem):
  `packages/database/src/notifications/` é o escutador próprio (protocolo v3, SCRAM-SHA-256, TLS, backoff, RE-LISTEN). O worker emite
  `pg_notify` na transação do passo; a API entrega por dono (`apps/api-ativada/src/stream/`) e manda `resync` se o LISTEN cai. Ticket por
  `POST /v1/stream/tickets` (Bearer), consumido no upgrade; `Origin` na allowlist; 4401 token vencido, 4403 conta bloqueada ou apagada, 4408
  sem pong, 1001 no desligamento. Ticker em `packages/market-data-crypto/src/ticker/` e `apps/api-ativada/src/market-stream/`; ligado por
  `TICKER_STREAM_ENABLED=true`. Env novo: `STREAM_MAX_SOCKETS_PER_USER`, `STREAM_MAX_PAIRS_PER_SOCKET` (10), `TICKER_STALE_SECONDS` (10),
  `TICKER_STREAM_ENABLED`, `BINANCE_BASE_URL`, `BINANCE_STREAM_URL` na API. `make stream-api-test` sobe tudo e prova entrega, resync,
  handshake, ticker, vencimento, bloqueio e desligamento; `make stream-mutants` prova o escutador. Mutante do stream/ticker: `test/*-mutants.*`.
- **Correções da revisão da Fase 4 (ADR 0002 "Espera por dado", ADR 0001 §r).** (H1) A lacuna de candles NÃO depende da memória do worker: a espera é gravada em `runs.waiting_*` (migration 0016), conta recuperações limpas (`LIVE_GAP_CONFIRM_RECOVERIES`, padrão 3, buraco com ao menos 10 min) ou confirma por idade (além de `STREAM_GAP_LOOKBACK_HOURS`), avisa o dono com o evento `warning` e aparece em `GET /v1/runs/:id` como `waitingForData`; prova em `test/live-gap-wait.contract.test.ts`, `make database-test` e `make live-test`. (M1) O escutador do NOTIFY recusa `AuthenticationOk` sem `SASLFinal` verificado (e `ok` sem SASL com senha configurada). (M2) Leitor de quadros linear (deslocamento, um corte, teto de quadros por leitura). (M3) `claimDue` encerra como `failed` (`attempts_exhausted`) o alerta que esgotou as reivindicações, e `winRate` do conteúdo precisa ser decimal. (M4) `socket.send` 0/-1 vira `resync` ou 1013 (`stream/socket-delivery.ts`), com `backpressureLimit`. (M5) `GET /v1/runs/:id` lê no máximo cinco pontos da curva (`listSurvivalPoints`), com paridade contra a função pura. (L1) Falha fatal do escutador (senha, autenticação, TLS) vira erro no log e `listener.state = failed` em `/v1/admin/health`. (L2) IPv6 literal sem colchetes. (L5/L7) resposta a socket fechado não lança; `listen-session.ts` dividido.
- **Alerta de sinal no Telegram (T4.5, ADR 0002 "Alerta de sinal no Telegram", ADR 0001 §s).** O passo ao vivo enfileira, NA transação do candle, uma linha de `alerts` por sinal BUY/SELL de candle fresco (`LIVE_ALERT_MAX_AGE_CANDLES` = 2) de dono com Telegram vinculado e alertas ligados (chave única `execução + candle + lado + canal`: reentrega, queda e retomada nunca duplicam; passo desfeito leva o alerta junto). O despachante do worker (`apps/worker-ativada/src/alerts/`) reivindica com arrendamento (`FOR UPDATE SKIP LOCKED`), lê o chat do DONO DA LINHA no envio (desvinculado depois de enfileirar = dispensado), monta o texto do `payload` (motivo, placar, ação simulada, stop, alvo, acerto fora da amostra do último walk-forward concluído da versão, lido best-effort) e envia pela Bot API por `fetch`: 429 respeita `retry_after` (teto 15 min), 5xx e rede repetem com 30/60/120/240 s e a 5ª tentativa desiste, 4xx é definitivo. Falha do Telegram NUNCA chega ao passo ao vivo; token e chat NUNCA vão a log nem a erro (o erro do `fetch` cita a URL com o token: o cliente devolve só um código). Env: `TELEGRAM_BOT_TOKEN` (opcional; sem ele o recurso inteiro fica desligado), `TELEGRAM_API_BASE_URL`, `ALERT_POLL_SECONDS`. `alerts` entra no registro LGPD (exporta sem o arrendamento, apaga antes de `runs`). `telegram_chat_id` segue em texto no banco (lacuna no ADR 0001 §s). Teste novo do passo usa `loadLiveApi()`/`loadLiveAlertParts()` e do despacho `loadAlertsApi()` (`test/fixtures/telegram/`): é por eles que os mutantes entram. Prova: contratos, `make alert-mutants` (11), `make telegram-test` (Postgres real + Bot API falsa) e `make telegram-mutants` (4).
- **Registro cronológico em CSV (T4.6, ADR 0002 "Registro cronológico em CSV").** `GET /v1/runs/:id/log.csv` junta sinais, ordens e preenchimentos (`listLog`, `UNION ALL` com cursor `(candle, posição do tipo, chave)`; no mesmo candle: preenchimento, sinal, ordem), em fluxo por páginas de 1.000, só do dono, 21 colunas fixas, tempos em UTC ISO, decimais em texto exato e a proteção de fórmula da T3.4. Prova: `test/api-run-log-export.contract.test.ts`, 10 mutantes da API, `make runlog-mutants` (10) e `make api-runs-test`.
- **Operações no gráfico (spec 005, ADR 0002 O1 a O11).** `GET /v1/runs/:runId/trades` aceita `from`, `to` e `status` e traz `paid`, `received`, `fees` e `netProfitRate` (campos antigos intactos). `GET /v1/runs/:runId/chart` (30/min por usuário, política `RUN_CHART`; o `/trade-summary` também, `RUN_TRADE_SUMMARY`) devolve as colunas mín-máx por balde calculadas em SQL (teto de 2.000 colunas) e até 500 marcadores ou clusters; a faixa é `[from, to)` em ms UTC; SEM cache no servidor. `GET /v1/runs/:runId/trade-summary` traz os totais e a frase pronta (arredonda contra o usuário: o que se paga e as taxas sobem, o que se recebe e o saldo descem). Walk-forward só lê as janelas de TESTE. Não mude `packages/strategy-engine` nem `packages/run-recording` por causa delas.
- **Metas (T4b.1 a T4b.4, ADR 0002 "Metas", "Próximo gatilho" e "Simulação com meta").** `evaluateGoal` (puro, `EngineDecimal`): uma janela de `prazo` dias por candle de partida, perda máxima (`equityAtLow`) ANTES do alvo, prazo no último candle; níveis arredondados para CIMA, taxa de alcance para BAIXO e de parada para CIMA a 8 casas; veredito `COMPRAR`/`SEGURAR`/`EVITAR` por contagens inteiras (`GOAL_VERDICT_RULES`, mínimo de 20 janelas). `computeNextTriggers` diz o que falta para a regra votar (aguardando entrada ou comprado; `exact` ou `indicative`). `goals` (migration 0014) com teto de 20 por usuário, `GET/POST /v1/goals`, `GET/PATCH/DELETE /v1/goals/:goalId` (`409 GOAL_IN_USE`: o RESTRICT é `23001` no Postgres 18 e `23503` antes, `isRestrictViolation` aceita os dois) e `GET /v1/goals/:goalId/evaluation` (5 estratégias mais novas × pares habilitados em `1d`, ranking por multiplicação cruzada das contagens, cache em memória, 20/min). `POST /v1/runs` aceita `goalId` em `live_paper` (meta do dono, ligada, do mesmo par) e a fotografa em `runs.request.goal`; o worker julga cada candle com `judgeGoalStep`, no desfecho reexecuta o passo com `exit_position` + `halt`, grava `goal_outcome` (`goal_reached`/`goal_stopped`/`goal_expired`, uma vez, na transação do candle), enfileira UM alerta `GOAL` e conclui a execução quando a carteira assenta (migration 0015). Teste novo do worker usa `loadLiveGoalParts()` (`test/fixtures/live/`) e da API `createGoalsHarness()`; os mutantes entram por eles. Prova: contratos, `make database-test`, `make goals-test` (API e Postgres reais), `make live-test`, `make telegram-test` e os mutantes de cada peça.
- **Plano, alertas de preço e ativos (T4b.5 a T4b.8, ADR 0002 "Plano de operação", "Alertas de preço" e "Seus ativos", ADR 0001 §t).** `computeLatestPlan` (puro, `packages/strategy-engine/src/plan/`) acha o fechamento do PRÓXIMO candle que faz o placar e cada regra sinalizarem compra e saída, no tick, com o próprio `signalStep` de produção sobre um candle hipotético (abre no último fechamento, máxima/mínima entre abertura e fechamento, volume repetido); `findTransition` não presume monotonia e entrega o par de ticks vizinhos (um sinaliza, o outro não); `basis` é `indicative` com OBV ou regime ADX. `computePlanLevels` (compra futura) e `computeHoldingLevels` (posição já comprada) dão alvo e stop de venda com taxas e slippage, sempre para cima no tick. `GET /v1/goals/:goalId/plan?strategyId=`. `price_alerts` (0017): `GET/POST /v1/price-alerts` e `GET/PATCH/DELETE /v1/price-alerts/:alertId`, teto de LIGADOS `PRICE_ALERT_MAX_ENABLED_PER_USER`, religar rearma. A avaliação mora na API (que tem o ticker): `createPriceAlertEvaluator` assina `PriceTickListener`, tick mais velho que `TICKER_STALE_SECONDS` não avalia, e `fireDueAlerts` faz o `UPDATE ... WHERE ligado AND disparado_em IS NULL` (inclusivo) mais o aviso em `alerts` (lado `PRICE`, migration 0018, `run_id` nulo) e o `pg_notify('run_events', { kind: 'price_alert', alertId })` na mesma transação; a API entrega ao dono ativo (`{ type: 'price_alert' }`) e o worker envia o texto ao chat. `user_assets` (0019): `GET /v1/assets`, `/v1/assets/summary` e `GET/PUT/PATCH/DELETE /v1/assets/:symbol`; compra pondera o médio (para cima, 8 casas), venda nunca passa da quantidade, `USER_ASSET_MAX_PER_USER`; o resumo vem em USDT. Teste novo de plano usa `loadPlanApi()` (`test/fixtures/strategy-engine/plan/`) e de rota usa `createPriceAlertsHarness()`/`createAssetsHarness()`; os mutantes entram por eles. Prova: contratos, `make database-test`, `make price-alerts-test`, `make price-alert-mutants`, `make user-asset-mutants`, `make lgpd-test` e `make telegram-test`.
- **Correções da auditoria T6.2 (ADR 0001 §v, ADR 0002 "Metas: CPU fora da thread da API").** (A1) A avaliação de metas roda num pool de `worker_threads` (`goals/goal-evaluation-pool.ts`, `GOAL_EVALUATION_THREADS/TIMEOUT_SECONDS/MAX_CONCURRENT`) atrás do portão `goal-cold-gate.ts`: uma avaliação a frio em voo por usuário, teto global (`503 GOAL_EVALUATION_BUSY`) e orçamento `GOAL_EVALUATION_COLD` de 3/min por usuário, cobrado só quando o cache erra; o `PATCH` que muda alvo/prazo/perda gasta o mesmo orçamento (`goal-cold-budget.ts`). O cálculo puro é `computeGoalCombination`; o sinal do pedido cancela. (A2) Tetos por usuário sob trava (`StorageQuotaReachedError` no banco, 409 na rota): `STRATEGY_MAX_PER_USER`, `STRATEGY_MAX_VERSIONS_PER_STRATEGY`, `PRICE_ALERT_MAX_DISABLED_PER_USER`, `RUN_STORAGE_MAX_PER_USER` (esta na admissão); `DELETE /v1/runs/:id` é exclusão lógica (`runs.deleted_at`, só execução terminada; leituras filtram `deleted_at IS NULL`); `GET /v1/me/export` é NDJSON em fluxo paginado por cursor (`account-export-stream.ts`, `account-export-ndjson.ts`). (M1) Produção exige `sslmode=verify-full` e senha do banco de 32+ caracteres; `DATABASE_SSL_ROOT_CERT` (PEM) vale para `Bun.SQL` e escutador (que agora confere o NOME do servidor); SCRAM com piso 4096/teto 262144 e `-PLUS` (`tls-server-end-point`). (M3) `redirect: 'error'` em toda chamada com segredo. (M4) `PUT` no CORS e cabeçalhos do painel em `panel-security-headers.constant.ts` (a borda DEVE servi-los; mesma origem). (M5) `PRICE_ALERT_MUTATION` 10/min, `PRICE_ALERT_MIN_REFIRE_SECONDS` (`last_fired_at`, migration 0020) e `ALERT_TELEGRAM_DAILY_LIMIT_PER_USER` no despachante. (B) log de erro de fora só com `name`+`code` (`logging/own-error.ts`); docs só em `ENV=dev|test`. Contratos de TLS usam o `openssl` da máquina (`test/fixtures/tls/`). Pendentes do responsável: M2 (cifra do chat), A3 (CI/deploy/réplica única) e a retenção proposta no ADR.
- **Prazos e filtros por par (spec 003, ADR 0002 "Prazos (spec 003, Fase 1)" e "Filtros de preço e quantidade por par").** `packages/strategy-engine/src/horizon/`: `computeHorizonWindows` (retorno líquido por janela de N dias SEM alvo nem perda, mesmo caminho das metas via `goal/goal-window-path.ts`), `summarizeHorizon` (mediana, % positivas, pior 10% nearest-rank, comprar e segurar), `recommendHorizon` (regra do spec §5 em `HORIZON_RECOMMENDATION_RULES`: mediana > 0, ≥ 55% positivas, pior 10% ≥ −10%, mínimo de 60 janelas, desempate pelo MAIOR prazo, comparação pelo texto arredondado) e `summarizeIntraday` (15 min: `NAO_COMPENSA` quando líquido ≤ 0 ou taxas > 50% do ganho BRUTO antes das taxas; `grossProfit` das métricas já é depois das taxas). `GET /v1/horizons?symbol=&strategyId=` (`apps/api-ativada/src/horizons/`): cálculo no pool de threads das metas atrás de um segundo portão a frio (divide o orçamento `GOAL_EVALUATION_COLD` por minuto), cache por (versão, par, último candle diário e de 15 min), linha de 15 min com `advanceCandle` EM MEMÓRIA (nunca grava `runs`), frases em português geradas no servidor (`horizon-messages.ts`). Painel: rota `/prazos` (`src/horizons/`). Tick e passo da Binance por par moram em `packages/market-data-crypto/src/symbol-filters.constant.ts`; BTCUSDT e ETHUSDT ficam FORA da tabela (padrão do motor, `runHash` antigo intacto), par sem filtro reprova o boot e o `POST /v1/runs`. Mutantes: `horizon-mutants`, `api-horizons-mutants`, `symbol-filters-mutants`.
- **Simulação ao vivo robusta (spec 006, ADR 0002 "Simulação ao vivo robusta (spec 006)").** (1) Reconexão: `ResilientDatabase` (`packages/database/src/connection/`) é o porteiro do `Bun.SQL`: 2 falhas de conexão seguidas (`RECONNECT_FAILURE_THRESHOLD`) ou estouro do teto por unidade (`DATABASE_QUERY_TIMEOUT_SECONDS`, 5 a 300, padrão 30) fecham e reabrem o cliente a qualquer momento (a transação viva termina no cliente velho, que só fecha quando ninguém mais o usa); o servidor aborta a consulta lenta antes, com `statement_timeout` = teto − 5 s (piso 1 s; SQLSTATE 57014 é erro da consulta, não banco fora), e o estouro do teto do cliente só vira `down` se um `SELECT 1` em cliente novo (2 s) também falhar; depois do `close()` o porteiro não reabre; cada laço (worker e API) espera backoff de 1 s a 30 s com sorteio, sem desistir. Log só com `name`, `code` e `errno` (nunca mensagem, URL, usuário ou senha): `database unavailable` na 1ª falha e a cada 60 s com a contagem, `database recovered` na volta. (2) Batimento: o worker grava `worker_heartbeats` (migration 0022) a cada `WORKER_HEARTBEAT_SECONDS` (5 a 120, padrão 15); `stale` = mais de 3 batimentos sem gravar. (3) Saúde: `GET /v1/health` (público) faz `SELECT 1` com teto de 1 s e responde `200 { status: ok }` ou `503 { status: degraded }`, SEM detalhe; `GET /v1/admin/health` traz `worker { lastHeartbeatAt, ageSeconds, state }` e o último `code` do banco. (4) Parada: a API varre a cada `LIVE_STALL_SWEEP_SECONDS` (5 a 3600, padrão 60, com trava consultiva) e marca `runs.stalled_since` (migration 0023) quando agora > fim da vela devida + `LIVE_STALL_GRACE_MINUTES` (5 a 240, padrão 15); espera por dado (`waitingForData`) não conta. `GET /v1/runs*` traz `stalledSince` (opcional) e a varredura enfileira UM alerta `STALL` e UM `RESUME` por episódio (lados novos de `alerts`, só dono com Telegram). (5) Vela da simulação: `POST /v1/runs` leva `timeframe` (padrão do painel `1h`, opções 1h/4h/1d e 15m em "Mais opções" com aviso de taxas); o ranking das metas continua só em `1d` e a tela diz isso. `src/goals/simulation-timeframe.constant.ts`, `next-candle-close.ts` (puro) e `SimulationTimeframePicker` no painel; `LiveRunStatus` mostra parada, espera por dado, "Aguardando a primeira vela, que fecha às HH:MM" e última/próxima decisão na Visão geral, na meta ativa e no detalhe. (6) Ambiente local: `scripts/dev-up.sh|.ps1` e `dev-down.sh|.ps1` sobem e param infra, migrations, API, worker e painel (logs em `.dev/logs/`, pids em `.dev/pids/`; moedas de `MARKET_SYMBOLS`; `dev-down` nunca apaga volume; `--dry-run`); "o banco não responde" está em `docs/runbook-dev-local.md`. (7) Alvos novos: `make db-outage-test` (Postgres de teste atrás de um proxy TCP, derrubado e religado: volta em ≤ 60 s, `fills`/`signals` iguais aos da execução contínua, `/v1/health` 503 e 200, log sem PII) e `make stall-mutants` (11 mutantes da varredura de parada). Não mude `packages/strategy-engine` nem `packages/run-recording` por causa disto.
- **Windows.** Fixtures com `new URL(...).pathname` (e `MIGRATIONS_FOLDER`) quebram no Windows (`/C:/...`): rode os gates no Linux/WSL, num espelho em disco Linux (`rsync` sem `node_modules`) para não sobrescrever o `node_modules` do Windows. `api-goals-mutants` leva cerca de 860 s com 12 mutantes em paralelo e estoura o `beforeAll` de 900 s com o paralelismo padrão.
