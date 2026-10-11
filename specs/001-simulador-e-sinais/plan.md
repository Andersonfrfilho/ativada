# Plano — Spec 001

## 1. Arquitetura

```
                 Binance REST (histórico)          Binance WS (kline ao vivo)
                          │                                   │
                   cron-cryptoada (backfill)              worker-cryptoada
                          │                       ┌──────────┴──────────┐
                          ▼                       │ candle fechado      │
                     PostgreSQL ◄──────────────── │ → strategy-engine   │
                          │   LISTEN/NOTIFY       │ → corretora simulada│
                          ▼                       └──────────┬──────────┘
                    api-cryptoada ── WebSocket ──► frontend-cryptoada   Telegram ◄─┘
                    (backtest em worker_thread)
```

| Peça | Papel |
|---|---|
| `packages/strategy-engine` | Puro, sem I/O: indicadores (implementação própria), votos, regime, risco, corretora simulada, métricas, walk-forward. Contrato no ADR 0002 (T2.1, revisado na T2.1b): `step ≡ walletStep ∘ signalStep`, puro; `EngineState` versionado em JSON canônico, em duas partes (sinal e carteira); versão da estratégia (só a lógica, `configHash`) separada dos `RunParameters` (par, timeframe, saldo, taxa, slippage, filtros, participação no volume; `runHash`); tamanho da posição pelo valor em risco no preenchimento; sentimento por disponibilidade; comandos (`halt`/`resume`/`exit_position`) e tipos de relatório da corretora; recusas com código estável. Depende só de `decimal.js@10.6.0` e `zod@4.6.5` (exatos). Harness de contrato em `test/fixtures/strategy-engine/` |
| `packages/database` | Drizzle (driver `Bun.sql`), schema, migrations com `rollback.sql` obrigatório, cliente; usado por API, worker e cron |
| `packages/environment` | Validação Zod do ambiente (`parseEnvironment`, `runWithEnvironment`, `postgresUrlSchema`); lista todas as variáveis inválidas e nunca imprime valores |
| `packages/identity-admin` | Cliente da Admin API do Keycloak (service account `cryptoada-api-service`): convidar, bloquear, apagar e encerrar sessões de usuário; compartilhado pela API e pelo cron, porque uma app não importa código de outra (ADR 0001 §h) |
| `packages/run-recording` | (T4.1) O que o backtest e a simulação ao vivo compartilham, para existir uma implementação só: `advanceCandle` (o ÚNICO passo de candle do produto: declara a lacuna ao motor pela contagem exata, escolhe o sentimento com o corte de inserção e chama o `Engine.step`), o buffer que transforma as decisões do passo em linhas das seis tabelas de resultado, o rastreio de posição (a proteção de stop e alvo que a linha fechada precisa), o mapeamento candle/sentimento do banco para o motor e o parse de JSON canônico. Depende de `@cryptoada/database` e `@cryptoada/strategy-engine` (workspace). O backtest da API e o avaliador do worker o importam; apps não importam código umas das outras |
| `packages/market-data` | Cliente REST de klines da Binance (`fetchKlines`, `fetchKlinesRange`): resposta validada com Zod, candle aberto descartado, controle de peso (`x-mbx-used-weight-1m`), 429/418 e backoff; compartilhado por cron e worker. Base `https://data-api.binance.vision` (host só de dados de mercado públicos, sem chave nem restrição de região, indicado pela documentação da Binance); `https://api.binance.com` é a alternativa e a base é parâmetro do cliente. `createKlineStream` (T1.5) abre o stream combinado de klines `wss://data-stream.binance.vision/stream?streams=btcusdt@kline_1h/...` (mesmo host só de dados de mercado, sem user data stream; símbolos em minúsculas; envelope `{ stream, data: { e: 'kline', E, s, k: { t, T, s, i, o, c, h, l, v, n, x, ... } } }`, `x` booleano = vela fechada): valida cada mensagem com Zod, entrega só `x === true` como `Candle` com preços string, descarta o resto contando (sem eco da mensagem), reconecta com backoff exponencial + jitter, vigia silêncio (`staleAfterMilliseconds`, padrão 60 s; a Binance envia ping a cada 20 s) e trata a desconexão forçada de 24 h como queda normal; URL base é parâmetro |
| `apps/cron-cryptoada` | One-shot agendado: exclusão de contas (passos 2 e 3 e remoção da linha de `users`, ADR 0001 §h; retenção de 90 dias do IP da auditoria), backfill de candles (`backfill-candles`: por par, em sequência, janela de `BACKFILL_YEARS` alinhada à grade, lacunas por `findMissingOpenTimes` em SQL, uma página gravada por vez; `MARKET_EXCHANGE`, `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BACKFILL_YEARS`, `BINANCE_BASE_URL`, `CRON_TASKS`; prova em `make backfill-test`), correção de lacunas, Fear & Greed |
| `apps/worker-cryptoada` | Consome o stream de klines; no candle fechado, avalia as simulações ativas, grava e notifica. **Simulação ao vivo (T4.1, `src/live/`, ADR 0002 "Simulação ao vivo (T4.1 e T4.2)")**: `createLiveEvaluator(...).tick()` cancela as simulações de conta inativa, renova o batimento, reivindica (`createLiveRunRepository.claimLiveRuns`: `claimed_by` + batimento, teto `maxActiveLivePaperRuns` por usuário, `SKIP LOCKED`, assume a de worker caído) e avalia cada execução detida: lê o checkpoint, os candles fechados depois dele (até 500 passos por ronda) e dá UM passo (`advanceCandle`) por candle numa transação só (linhas + `engine_state` + `last_candle_time`); o `createLiveScheduler` roda uma ronda a cada `LIVE_POLL_SECONDS` (padrão 5) e uma a cada candle gravado. Buraco entre candles espera a recuperação e só vira lacuna (posição fechada, motivo `gap`) quando ela o marcou como inalcançável; conta apagada/bloqueada não é avaliada e FK violada é execução encerrada, sem erro; erro de banco repete, erro tipado grava só o código. Variáveis: `LIVE_POLL_SECONDS` (1 a 300, padrão 5) e `LIVE_HEARTBEAT_TIMEOUT_SECONDS` (5 a 3600, padrão 60, maior que o intervalo). Prova: `make live-test`. Etapa T1.5 (já ativa, endurecida na T1.6): cada vela fechada vai para `upsertCandles` (idempotente; escrita que falha repete 3 vezes com backoff e então dispara a recuperação) e a recuperação de lacuna baixa pelo REST só as aberturas que faltam numa JANELA DE RETROCESSO `[agora - STREAM_GAP_LOOKBACK_HOURS, última vela fechada)` (`findMissingOpenTimes`, por par, em sequência), em CADA (re)conexão e a cada `STREAM_GAP_CHECK_MINUTES`; falha agenda nova tentativa com backoff sem parar o stream; 418 faz dormir o `Retry-After` (teto 24 h) sem seguir pelos pares; par sem nenhum candle fica para o backfill do cron. A hora de corte vem do relógio do servidor (`createServerClock`, `GET /api/v3/time`). Variáveis: `MARKET_EXCHANGE` (só `binance`), `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BINANCE_BASE_URL` (REST), `BINANCE_STREAM_URL` (`wss://` em produção), `STREAM_STALE_SECONDS` (5 a 600, padrão 60), `STREAM_GAP_LOOKBACK_HOURS` (1 a 720, padrão 168), `STREAM_GAP_CHECK_MINUTES` (1 a 1440, padrão 15). Prova: `make stream-test` (worker real em subprocesso, Postgres descartável, Binance falsa REST + WebSocket) **Alerta no Telegram (T4.5, `src/alerts/`, ADR 0002 "Alerta de sinal no Telegram")**: o passo ao vivo enfileira o alerta de cada sinal BUY/SELL de candle fresco na própria transação (`appendAlerts`) e `createAlertDispatcher` (agendado por `ALERT_POLL_SECONDS`, padrão 2) reivindica com arrendamento, monta o texto (motivo, placar, ação simulada, stop, alvo, acerto histórico), entrega pela Bot API (`fetch`, URL base `TELEGRAM_API_BASE_URL`) e repete com espera de 30 s a 4 min (5 tentativas; 429 respeita `retry_after`); sem `TELEGRAM_BOT_TOKEN` o recurso fica desligado. Prova: `make telegram-test` e `make telegram-mutants`. |
| `apps/api-cryptoada` | `Bun.serve`: REST, WebSocket para o painel, backtest e walk-forward em `worker_thread`. Backtest (T3.2, `src/backtest/`, ADR 0002 "Backtest em `worker_thread` (T3.2)"): `runBacktest({ database, runId })` resolve o dono pelo `runId` (`resolveRunOwnerScope`, só para runIds enfileirados pela API), confere os hashes recalculados, carrega o pré-aquecimento (`leadInCandles`) e o período por páginas, declara as lacunas ao motor, executa o `Engine.step` de produção e grava UMA transação por lote de 2.000 passos (status, resultados, checkpoint), cancela entre lotes, falha com `error_code` estável (`NO_CANDLES`, `INSUFFICIENT_HISTORY`, `HASH_MISMATCH`, `BACKTEST_TIMEOUT`, `WORKER_CRASHED`, …) e retoma do checkpoint com resultado idêntico ao da execução contínua. A thread (`backtest.worker.ts`) abre o próprio banco, valida `{ runId }` e os eventos com Zod, e a API a termina no timeout (`BACKTEST_TIMEOUT_SECONDS`, padrão 900) e no encerramento gracioso. Medida: 17.520 candles `1h` de ponta a ponta em ~3,4 s (`make backtest-test`). Walk-forward (T3.3, `src/walk-forward/`, ADR 0002 "Walk-forward (T3.3)"): `runWalkForward({ database, runId, options })` valida a grade no catálogo FECHADO de caminhos ajustáveis (teto de 200 combinações VÁLIDAS), planeja janelas em meses de calendário UTC, avalia cada combinação em até `WALK_FORWARD_THREADS` threads de busca (o sinal sai UMA vez da série contínua e a carteira roda por janela), escolhe por Sharpe líquido do AJUSTE com mínimo de operações, testa janela a janela com a carteira encadeada e grava, por janela, a linha de `walk_forward_windows`, os resultados do teste e o checkpoint na mesma transação; o relatório principal (`runs.metrics`) é o FORA DA AMOSTRA concatenado e `metrics.overfitting` guarda o alerta |
| `apps/frontend-cryptoada` | React 19 + Vite, PWA (§5d) |

O motor é o mesmo para backtest e ao vivo: o backtest alimenta candles do banco num laço; o ao vivo
alimenta um candle por vez. A interface é uma só, com duas metades para quem calcula o sinal uma vez e
várias carteiras sobre ele (metas, walk-forward):

```ts
type EngineStep = (input: StepInput) => StepResult; // estado entra, estado sai — sem I/O
// step ≡ walletStep ∘ signalStep (ADR 0002 §a)
```

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | Bun + TypeScript estrito, monorepo com workspaces | Padrão do ecossistema |
| D2 | Postgres + Drizzle; candles em tabela com PK composta | Consulta por intervalo é o caso dominante |
| D3 | `decimal.js` para dinheiro e quantidade | Constituição §6 |
| D4 | Indicadores com implementação própria no `strategy-engine`, só com `+ − × ÷` e `Math.sqrt`, janelas recalculadas; `trading-signals` entra só como oráculo de referência nos testes (devDependency da T2.2) — ADR 0002 §c | Reprodução byte a byte entre runtimes: biblioteca usa `Math.pow`/`exp` e somatórios corridos; a referência externa continua conferindo os valores |
| D5 | Sem fila externa na etapa 1: o stream da Binance é a entrada do worker; worker→API por `LISTEN/NOTIFY` | Multiusuário, mas uma instância de API e um worker na etapa 1: o volume cabe no Postgres e RabbitMQ seria peso sem ganho. Mais de uma instância exige ADR (estado em memória da API: rate limit, tickets, sockets) |
| D6 | Execução em `t+1` na abertura; stop antes do alvo no mesmo candle | Constituição §3 e §4 |
| D7 | Saldo em USDT; exibição em R$ pela cotação USDT/BRL do momento | Pares cotados em USDT têm mais liquidez e histórico |
| D8 | Telegram por Bot API direta (`fetch`), sem SDK | Dois métodos usados; dependência não se paga |
| D9 | Keycloak (OIDC) para login, com realm versionado em `realm/`; a API valida o JWT pela JWKS com a biblioteca `jose` na versão exata `6.2.12` (dependência prevista, instalada na T0.7) e faz o papel de *token handler* com cliente confidencial (ADR 0001) | Senha, recuperação, verificação de e-mail e TOTP prontos; mesma pilha já usada no ecossistema |
| D10 | Tabela `users` local espelha o `sub` do Keycloak (criada no primeiro acesso) e guarda preferências | O domínio referencia `user_id` sem depender do Keycloak em cada consulta |
| D11 | Autorização por objeto num único ponto: todo método de repositório de recurso de usuário recebe `OwnerScope` como primeiro parâmetro. Defesa em camadas (ADR 0001 §c): (1) o escopo e o `UserId` só nascem dentro de `@cryptoada/database`, cujo índice público exporta só os tipos e a app os recebe por retorno de função do pacote (`resolveUserBySubject` → `{ userId, scope }`); (2) o lint de `apps/*/src` é lista de bloqueio com as brechas conhecidas fechadas por sonda (Drizzle, `Bun.SQL` em todas as formas, `import()` dinâmico no backend, subcaminhos, asserção, *type guard* e sobrecarga que devolve `UserId`/`OwnerScope`/`AccountId`); (3) contrato negativo por rota | Chamar repositório sem escopo de dono não compila e a app não recebe o escopo por nenhum caminho que o pacote não tenha emitido; as camadas se cobrem entre si e a lista de brechas conhecidas está no ADR, sem afirmar impossibilidade absoluta |
| D13 | `ENV=production` exige configuração explícita (ADR 0001 §g e §p): `TRUSTED_PROXY_HOPS` sem default (1 ou mais atrás de proxy), todas as URLs `https://`, `DATABASE_URL` com `sslmode=require`, segredos de 32+ caracteres e nenhum valor `_dev_only`/`_test_only`; vale para API e cron e a falha de boot não ecoa valores | Um default seguro em dev vira IP errado no rate limit e TLS desligado em produção sem que nada falhe |
| D12 | Worker avalia todas as simulações ativas do par no mesmo candle e roteia alertas pelo dono | Um stream de mercado para todos (RNF06) |
| D15 | Contrato do motor no ADR 0002: estado explícito e serializável em duas partes (retomada pelo snapshot; migração = execução nova ligada à anterior, replicada do início), preenchimento com arredondamento sempre contra o usuário, stop no toque e alvo só ao passar, stop sai a `min(stop, abertura)` com slippage, melhora de preço da limitada só no 1º candle, quantidade calculada no preenchimento a partir do VALOR EM RISCO decidido em `t` (perda no stop sem gap ≤ 1% do saldo, RF05), participação máxima no volume, lacuna só confirmada | Paridade backtest × ao vivo e retomada sem duplicar viram propriedade testável (`runEngineContract`, 20 verificações, 26 mutantes reprovados), não disciplina |
| D16 | A simulação ao vivo é do worker: ele reivindica por `claimed_by` + batimento (assume a de worker caído), dá UM passo por candle fechado numa transação só (linhas + estado + último candle) e retoma sempre do checkpoint. O passo é o `advanceCandle` do pacote `run-recording`, o mesmo do backtest | Reiniciar não duplica operação nem sinal e a paridade com o backtest é estrutural, não disciplina (T4.1, T4.2) |
| D17 | O alerta de sinal sai de uma caixa de saída durável: o passo ao vivo grava a linha de `alerts` NA transação do candle (chave `execução + candle + lado`) e o despachante do worker a entrega ao chat vinculado do dono, com retry e espera crescente; falha do Telegram nunca toca o passo e reinício nunca duplica nem perde (T4.5, ADR 0002 "Alerta de sinal no Telegram") | Passo e Telegram têm vidas independentes; a atomicidade fica no banco |
| D14 | Fear & Greed vem da alternative.me (`sync-fear-greed` no cron, `sentiment_daily`). Os termos exigem crédito: a T5.2, e qualquer tela que exiba o índice, mostra "Fear & Greed Index por alternative.me" com link para https://alternative.me/crypto/fear-and-greed-index/ (RF01) | Termos de uso da fonte; sem o crédito o índice não pode aparecer |

## 3. Modelo de dados

| Tabela | Campos principais |
|---|---|
| `candles` | `exchange`, `symbol`, `timeframe`, `open_time` bigint em ms (PK composta, cobre a leitura do mais recente), `close_time`, `open/high/low/close numeric(24,8)`, `volume numeric(32,8)`, `trade_count`, `created_at`; CHECK `close_time > open_time`, `high >= low`, `open` e `close` entre `low` e `high` (migration 0006), `timeframe in ('15m','1h','4h','1d')`. Candle fechado é imutável (`ON CONFLICT DO NOTHING`); candle aberto (`close_time` além de agora + 5 s de tolerância de relógio) é rejeitado pelo repositório. Leitura por `[from, to)` |
| `sentiment_daily` | `date` PK, `fear_greed smallint` (CHECK 0..100), `classification` varchar nulo, `created_at`; o valor do dia é atualizado (`DO UPDATE`) — **só para exibição**, o motor não lê daqui |
| `sentiment_observations` | (T3.1, migration 0008) **dado público**, sem `user_id`, append-only e imutável: `id uuid`, `date`, `fear_greed smallint` (CHECK 0..100), `observed_at` bigint em ms (instante em que o valor ficou DISPONÍVEL: coleta ao vivo, ou data + atraso de publicação conservador configurável no cron, padrão 24 h, no histórico), `source varchar(64)` (inclui a regra do atraso), `created_at timestamptz`; único (`source`, `date`, `observed_at`). **`created_at` é o instante em que o valor ficou conhecido**: na carga histórica, o instante ESTIMADO de publicação (o repositório aceita `createdAt` explícito), nunca o horário da carga; ao vivo, o relógio do banco. Gatilho `BEFORE UPDATE OR DELETE` (por linha) e `BEFORE TRUNCATE` rejeitam a alteração com `sentiment_observations é append-only`. É a fonte do motor (ADR 0002 §f): o motor lê só a `source` da execução (`RunParameters.sentimentSource`, dentro do `run_hash`); `findAvailableAt({ source, observedUntil, insertedUntil })` devolve a última linha da fonte com `observed_at ≤ observedUntil` **e** `created_at ≤ insertedUntil` (empate em `observed_at`: a inserida por último), e `listAvailable` devolve a série elegível em ordem. Paridade: o backtest usa a fonte coletada AO VIVO quando existir para o período, e a histórica só onde faltar; mudar o atraso gera linhas novas, nunca reescreve |
| `users` | `id uuid`, `keycloak_sub varchar(255)` (único), `display_name`, `display_currency`, `timezone`, `telegram_chat_id` (nulo até vincular; único quando preenchido), `alert_telegram_enabled`, `limits jsonb`, `created_at`, `updated_at`, `blocked_at`, `deleted_at`, `identity_deleted_at`, `data_purged_at`, `example_strategy_seeded_at` (T3.5, migration 0011: a marca de que o usuário já recebeu a estratégia de exemplo; nunca zerada) (ADR 0001 §d, §h) |
| `telegram_link_codes` | `id`, `user_id` (único), `code_hash` (único), `expires_at`, `attempts`, `created_at` — vínculo do chat por código de uso único; só o hash é guardado |
| `strategies` | (T3.1, migration 0007) `id uuid` v7, `user_id`, `name varchar(120)`, `is_example bool`, `created_at`, `updated_at`, `deleted_at` nulo (soft delete: a estratégia some da listagem e não aceita versão nova, as versões e execuções ficam); `UNIQUE (id, user_id)`; (T3.5, migration 0011) índice único PARCIAL `(user_id) WHERE is_example`: no máximo uma estratégia de exemplo por usuário, mesmo apagada (soft delete) |
| `strategy_versions` | (T3.1) `id uuid`, `user_id`, `strategy_id` (FK composta `(strategy_id, user_id)`), `version int ≥ 1`, `config jsonb`, `config_hash varchar(64)` (CHECK SHA-256 hexadecimal), `created_at`; único (`strategy_id`, `version`) e único (`strategy_id`, `config_hash`): **configuração igual (mesmo hash) devolve a MESMA versão**, nunca uma nova (`addVersion` é idempotente; o `FOR UPDATE` na estratégia serializa a numeração); `UNIQUE (id, user_id)` |
| `runs` | (T3.1) `id uuid`, `user_id`, `strategy_version_id` (FK composta), `kind varchar` (`backtest`/`walk_forward`/`live_paper`, CHECK), `status varchar` (`queued`/`running`/`completed`/`failed`/`cancelled`, CHECK; só avança: `queued → running → completed`, `queued|running → failed|cancelled`; estado final não muda), `symbol`, `timeframe` (CHECK nos quatro), `run_parameters jsonb`, `run_hash varchar(64)`, `engine_version`, `signal_engine_version`, `metrics_version`, `period_start` bigint, `period_end` bigint **nulo** (o ao vivo não tem fim), `engine_state jsonb` nulo (checkpoint do motor), `last_candle_time` (monotônico), `metrics jsonb` nulo, `progress int 0..100`, `error_code` nulo, `migrated_from_run_id uuid` nulo (FK composta para `runs`: a execução que esta replicou com outro motor; a antiga fica imutável — ADR 0002 §b), `request jsonb` nulo (T3.4, migration 0010: o pedido do walk-forward — grade e janelas —, validado por Zod na API e lido pela thread; nulo no backtest), `claimed_by varchar(64)` nulo e `heartbeat_at` nulo (T3.6, migration 0012: a instância da API que roda a execução e o último batimento dela; CHECK `claimed_by IS NULL OR status = 'running'`; índices parciais da fila `queued` por antiguidade, dos `running` por batimento e do último início por usuário), `created_at`, `started_at`, `finished_at` (CHECK: preenchido se e só se o status é final); `UNIQUE (id, user_id)`. Os campos copiados `initial_balance`/`fee_rate`/`slippage_rate` do desenho antigo saíram: a fonte é `run_parameters` |
| `run_commands` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `command_id varchar(64)` (único com `run_id`), `kind` (`exit_position`/`halt`/`resume`), `reason`, `issued_at` bigint, `candle_time` bigint (candle em cujo fechamento agiu), `status` (`applied`/`ignored_duplicate`) — entrada persistida do passo e trilha; `DO NOTHING`: o primeiro registro do `command_id` vale |
| `signals` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `candle_time` bigint, `action` (`BUY`/`SELL`/`HOLD`), `score numeric`, `regime` (`trending`/`ranging`/`none`), `votes jsonb`, `indicators jsonb` (ids com espaço de nome, achatados), `sentiment_observation jsonb` nulo (a observação usada: valor, `observed_at`, fonte), `reason text` · único (`run_id`, `candle_time`), `INSERT … ON CONFLICT DO NOTHING` (imutável) |
| `orders` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `engine_key varchar(64)` (único com `run_id`; `w<índice>:order-N` no walk-forward, sem colisão entre janelas), `side`, `type` (`market`/`limit`/`stop`/`target`), `purpose` (`entry`/`exit`), `status` (`created`/`filled`/`cancelled`/`expired`/`rejected`), `reason` nulo (`below_min_notional`, `zero_atr`, `invalid_stop`, `opposite_signal`, `command`, `gap`, `volume_capped`), `quantity`, `price`, `limit_price`, `trigger_price`, `risk_amount`, `stop_distance`, `target_distance` (todos `numeric` nulos), `eligible_candles`, `created_candle_time`, `expires_candle_time` nulo, `last_event_candle_time` · `INSERT … ON CONFLICT (run_id, engine_key) DO UPDATE … WHERE` o status novo é posterior ao gravado e o dono é o mesmo (monotônico: `created` < qualquer estado final; um final nunca vira outro final nem volta a `created`); os campos nulos do evento novo não apagam o que o anterior trouxe (`coalesce`) |
| `fills` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `order_key`, `position_key`, `candle_time`, `side`, `price`, `quantity`, `notional`, `fee numeric` · único (`run_id`, `order_key`, `candle_time`), `DO NOTHING` |
| `positions` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `engine_key varchar(64)` (único com `run_id`), `status` (`open`/`closed`), `entry_price`, `quantity`, `stop_price`, `target_price`, `entry_fee` e, na posição fechada, `exit_price`, `exit_fee`, `net_profit`, `exit_reason` (`stop`/`target`/`signal`/`command`/`gap`), `closed_candle_time` (CHECK: fechada exige todos), `opened_candle_time` · upsert monotônico `open` < `closed` (fechada não reabre nem perde a saída) |
| `equity_points` | (T3.1) `user_id`, `run_id` (FK composta), `candle_time`, `equity numeric`, `equity_at_low numeric` (liquidação na mínima do candle: perda máxima da meta e piso do RF09), `benchmark numeric` · PK (`run_id`, `candle_time`), `DO NOTHING` (imutável) |
| `walk_forward_windows` | (T3.3, migration 0009) `id uuid`, `user_id`, `run_id` (FK composta `(run_id, user_id)`), `window_index int ≥ 0`, `train_start/end`, `test_start/end` bigint em ms (fim exclusivo; CHECK `train_start < train_end ≤ test_start < test_end`), `best_params jsonb` (`{ combinationIndex, assignment }`, nulo se a janela não teve parâmetro elegível; CHECK: nulo ⇔ `status = no_eligible_parameters`), `status varchar` (`ok`/`no_eligible_parameters`), `in_sample jsonb` (métricas completas do AJUSTE da combinação escolhida), `out_of_sample jsonb` (métricas do TESTE em unidades da carteira da janela, fator de encadeamento, operações encadeadas, patrimônio e régua finais), `eligible_combinations int`, `created_at` · único (`run_id`, `window_index`), `DO NOTHING` (janela concluída é imutável). O patrimônio, os sinais e as operações do TESTE vão para `equity_points` (encadeado em unidades relativas), `signals`, `orders`, `fills`, `positions` e `run_commands`, com `engine_key`/`command_id` `w<i>:` |
| `alerts` | (T4.5, migration 0013; 0015 acrescentou `GOAL` e 0018 `PRICE`) caixa de saída dos alertas de sinal, de desfecho de meta e de preço (o lado `PRICE` tem `run_id` nulo e `price_alert_id`; `candle_time` é o instante do tick): `id uuid`, `user_id`, `run_id` (FK composta `(run_id, user_id)`), `candle_time bigint`, `side` (`BUY`/`SELL`), `channel` (`telegram`), `payload jsonb` (só mercado e regra: par, fechamento, placar, regime, motivo, ação simulada, stop, alvo, acerto histórico), `status` (`pending`/`sent`/`failed`/`skipped`), `attempts`, `next_attempt_at`, `locked_until` (arrendamento do despachante), `last_error` (código curto), `created_at`, `sent_at` · único `(run_id, candle_time, side, channel)` (um alerta por candle); o chat NÃO é copiado, é lido de `users` no envio |
| `price_alerts` | (T4b.6, migration 0017) `id uuid`, `user_id`, `symbol`, `direction` (`above`/`below`), `value numeric > 0` (texto decimal exato), `origin` (`manual`/`plan`), `is_enabled`, `triggered_at` nulo, `created_at`; CHECKs de par, vocabulários e "disparado implica desligado"; `UNIQUE (id, user_id)`; índice parcial dos armados por par. Disparar é um `UPDATE ... WHERE ligado AND disparado_em IS NULL` que desliga e carimba; religar (`PATCH isEnabled: true`) rearma (RF14) |
| `user_assets` | (T4b.8, migration 0019) `id uuid`, `user_id`, `symbol`, `quantity numeric >= 0`, `average_price numeric > 0` (texto decimal exato), `created_at`, `updated_at`; `UNIQUE (user_id, symbol)` e `UNIQUE (id, user_id)`; compra recalcula o preço médio PONDERADO (para cima, 8 casas), venda nunca passa da quantidade (RF15) |
| `audit_events` | `id uuid`, `actor_user_id` (nulo), `actor_kind`, `target_kind`, `target_id`, `action`, `ip` (90 dias), `created_at`, `payload` sem PII — esquema único no ADR 0001 §i |

Toda tabela de usuário leva `user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT`:
`strategies`, `strategy_versions`, `runs`, `walk_forward_windows`, `signals`, `orders`, `fills`,
`positions`, `equity_points`, `alerts`, `goals`, `price_alerts`, `user_assets` e `telegram_link_codes`
(denormalizado de propósito: o filtro do dono não depende de join). Todo pai declara
`UNIQUE (id, user_id)` e toda filha o referencia por FK composta `(parent_id, user_id)` — inclusive
`runs.strategy_version_id`, `goals.run_id` e `goals.strategy_version_id` —, para que o banco recuse
dono divergente do pai. Índices começam por `user_id`. `candles` e `sentiment_daily` não têm dono;
`audit_events` é pseudonimizada na exclusão (ADR 0001 §h, §i).

Sem ENUM nativo (VARCHAR), PK UUID v7. Toda migration com rollback.

**Persistência de estratégias, execuções e resultados (T3.1).** Quem grava são quatro repositórios do
`@cryptoada/database` (`createStrategyRepository`, `createRunRepository`, `createRunResultRepository`,
`createSentimentObservationRepository`); nenhuma tabela nem cliente chega às apps. Os de dono recebem
`OwnerScope` como primeiro parâmetro, filtram `user_id` em toda leitura e escrita e devolvem `undefined`
(ou `{ outcome: 'not_found' }`) para recurso de outro dono, igual ao inexistente. A gravação de resultado é
em LOTE: `append*` abre UMA transação, confere que a execução é do dono e grava em blocos de no máximo 5.000
linhas (menos nas tabelas largas, para ficar abaixo de 60.000 parâmetros do protocolo do Postgres, limite
65.535: `orders` tem 20 colunas e sai em blocos de 3.000); uma linha inválida desfaz o lote inteiro.
`signals`, `fills`, `equity_points` e `run_commands` usam `DO NOTHING` (imutáveis); `orders` e `positions`
usam `DO UPDATE … WHERE` de status monotônico e, antes do INSERT, colapsam as linhas do mesmo `engine_key`
do lote (o Postgres recusa afetar a mesma linha duas vezes). Valores do motor (`price`, `quantity`,
distâncias, `score`, `equity`) são `numeric` **sem precisão**: o motor emite até 15 algarismos significativos
nas distâncias derivadas do ATR e uma coluna `numeric(24,8)` as arredondaria em silêncio. `jsonb` só aceita
objeto ou lista no topo (`JsonContainer`) e vai por `sql.param(valor)::jsonb`. Leitura paginada por cursor
estável (`candle_time` nas séries; `(created_candle_time, engine_key)` e afins nas tabelas de chave natural;
`runs` por `(created_at::text, id)` com microssegundos, porque `Date` do JS trunca a milissegundos e repetia
linhas). Migração do motor segue o ADR 0002 §b: nova execução com `migrated_from_run_id`. As operações
sem dono são as da fila (`createRunQueueRepository`, T3.6): reivindicar, renovar o batimento, recuperar órfãs, devolver ao encerrar e
cancelar as de contas inativas; a simulação ao vivo (`live_paper`) nunca é tocada pela fila: tem o próprio ciclo (`createLiveRunRepository`, T4.1). A transação POR PASSO do ao vivo
(decisões + `engine_state` + `last_candle_time`) exige gravar resultados e checkpoint na mesma transação: desde a T3.2 existe
`createRunBatchRepository(handle).runInBatch(scope, runId, work)` (trava a execução, status + `appendResults` + `saveCheckpoint`
na mesma transação), que o backtest usa por lote e o ao vivo (T4.1) usa por passo; `resolveRunOwnerScope(handle, runId)`
dá o dono ao worker (ADR 0001 §e, regra 8).

**Persistência do motor (ADR 0002 §b).** Ao vivo: uma transação por passo (decisões + `engine_state` +
`last_candle_time`); `CANDLE_ALREADY_PROCESSED` na retomada é "pule", não erro. Backtest: grava em LOTE,
com checkpoint do `engine_state` a cada lote (RNF01), mesmas chaves e mesmo upsert monotônico. Réplica
não reemite alerta: o chamador suprime alerta de sinal cujo `candle_time` já existia. Trocar a versão da
estratégia com posição aberta = `exit_position` e encerrar a execução; a versão nova inicia outra.

## 4. Estratégia de exemplo — "Placar clássico"

| Família | Indicador | Voto |
|---|---|---|
| Tendência | EMA 9 × EMA 21 | +1 acima, −1 abaixo |
| Tendência | MACD (12, 26, 9) | +1 MACD > sinal, −1 abaixo |
| Reversão | RSI 14 | +1 < 30, −1 > 70, 0 entre |
| Volume | OBV vs. sua EMA 20 | +1 subindo, −1 caindo |

Fonte ÚNICA no código de produção (T3.5): `CLASSIC_SCOREBOARD_STRATEGY` em `packages/strategy-engine/src/classic-scoreboard.strategy.ts` (nome, descrição e a configuração validada pelo esquema do motor; o contrato prova que ela e o fixture `classic-scoreboard.strategy.json` têm o MESMO `configHash`). Todo usuário recebe uma cópia editável (`is_example`) no primeiro acesso, UMA vez só.

Regime: ADX 14 ≥ 25 → tendência (peso 1,5 em tendência, 0,5 em reversão); < 25 → lateral (inverso).
Limiar: compra ≥ +2, venda ≤ −2. Risco: stop 2×ATR, alvo 3×ATR, 1% por operação.

Regras de voto (T2.3, ADR 0002 §f): estritas (`>`/`<`, empate vota 0); o rompimento de Donchian compara o
fechamento com o canal do candle **anterior**; o sentimento é contrário (medo extremo compra) e, ausente,
velho (> 48 h) ou de outra fonte, vota 0 com `isMissing`. Antes do aquecimento (194 candles no Placar
clássico) o passo não decide (`signal: null`); depois dele, indicador sem valor é erro tipado
(`MISSING_VALUE`). Motivo no formato fixo `Ação · pontuação ±N · regime · compra: … · venda: … · neutras: …[ · sem dado: …]`,
com o ADX truncado em uma casa. Sobre os candles reais do repositório o Placar clássico decide 307 candles
de BTCUSDT 1h (113 `BUY`, 57 `SELL`) e 207 de ETHUSDT 1d (60 `BUY`, 67 `SELL`).

## 5. Walk-forward

- Janelas: ajuste 6 meses, teste 2 meses, passo 2 meses, em MESES DE CALENDÁRIO UTC (sem `Date`) ancorados no
  começo do período; o teste começa exatamente onde o ajuste termina, as janelas de teste nunca se sobrepõem
  (passo ≥ teste) e menos de 3 janelas é erro tipado (`PERIOD_TOO_SHORT`). Cada janela carrega o aquecimento
  (`leadIn`) ANTES do início do ajuste e do teste.
- Grade: lista de `{ path, values }` sobre um catálogo FECHADO de campos ajustáveis da configuração (períodos,
  limiares, múltiplos de stop/alvo, risco); combinação que o esquema da estratégia recusa é descartada e contada à parte;
  o teto de 200 conta só as VÁLIDAS e a recusa (`GRID_TOO_LARGE`) vem ANTES de rodar, com a contagem. A grade fica na
  execução, não na versão da estratégia.
- Objetivo da busca: Sharpe líquido de custos NO AJUSTE, com no mínimo 10 operações fechadas (`minTradesPerWindow`);
  desempate determinístico (mais operações, menor queda na mínima, primeira da grade). Nenhuma combinação elegível ⇒
  a janela fica `no_eligible_parameters` e NÃO opera no teste (carteira parada).
- **Relatório principal = fora da amostra concatenado**: cada teste recomeça do patrimônio final do anterior, em
  unidades relativas, e `computeRunMetrics` roda sobre a curva contínua. O dentro da amostra só entra no alerta.
- **Alerta de overfitting**: Sharpe fora da amostra < 50% do de dentro (média ponderada pelos pontos do ajuste, só
  das janelas elegíveis), OU fora da amostra negativo com dentro positivo, OU menos de metade das janelas com parâmetro
  elegível, OU fora da amostra indefinido com dentro positivo. `{ isAlert, reasons, inSampleSharpe, outOfSampleSharpe,
  degradation }` em `runs.metrics.overfitting`.
- Taxa de acerto exibida nos alertas = acerto fora da amostra do último walk-forward da versão.

## 5b. Metas (RF13)

Entregue nas T4b.1 a T4b.4; a definição fechada (fórmulas, arredondamento, veredito, desempenho) está no ADR 0002, seções
"Metas (T4b.1)", "Próximo gatilho (T4b.2)", "Metas (T4b.3)" e "Simulação com meta (T4b.4)".

- `evaluateGoal` no `strategy-engine`: para cada (estratégia, par), uma janela de `prazo` dias por candle de partida (passo
  de 1 candle). A saída por meta **age no fechamento** do candle em que o `equityPoint` atinge o alvo ou a perda máxima
  (esta medida no `equityAtLow`, lado pior, ANTES do alvo) e **executa no candle seguinte** (comandos `exit_position` e
  `halt`, ADR 0002 §h) — nunca no preço do alvo. Puro e determinístico; mesmo motor do backtest.
- Custo: os SINAIS de cada (estratégia, par) são calculados UMA vez em série contínua; cada janela só lê a trajetória da
  carteira a partir da primeira compra, compartilhada entre janelas. A avaliação é só em `1d` (decisão da T4b.3: em `1h` o
  custo não cabe em uma requisição), cache por (versão, par, meta, dia do último candle). Medido: 5 pares de uma
  estratégia em 120 a 260 ms a frio e ~9 ms em cache.
- "Próximo gatilho" é função pura por família: distância entre o valor atual do indicador e o limiar que dispara o voto,
  nos estados aguardando entrada e comprado (`exact` quando há fórmula fechada, `indicative` no resto).
- Tabela `goals` (migration 0014): `id uuid`, `user_id`, `symbol`, `target_rate numeric`, `horizon_days`,
  `max_loss_rate numeric`, `is_active`, `created_at`, `updated_at`; `UNIQUE (id, user_id)`; teto de 20 por usuário.
- Simulação com meta (migration 0015): `runs.goal_id` (FK composta, RESTRICT), `goal_outcome` e `goal_outcome_candle_time`;
  a meta é fotografada em `runs.request.goal`; alerta `GOAL` na caixa de saída. Não existe `amount` nem `status` na meta: o
  estado vive na simulação.
- Rotas (seção 6): `GET/POST /v1/goals`, `GET/PATCH/DELETE /v1/goals/:goalId`, `GET /v1/goals/:goalId/evaluation` e
  `goalId` em `POST /v1/runs`.

## 5b2. Plano, alertas de preço e ativos (RF13 a RF15)

Entregues nas T4b.5 a T4b.8; a definição fechada está no ADR 0002 ("Plano de operação (T4b.5)", "Alertas de preço (T4b.6 e T4b.7)" e "Seus ativos (T4b.8)") e no ADR 0001 §t.

- **Plano:** função pura `computeLatestPlan` no motor; o preço é achado com o próprio `signalStep` de produção sobre um candle hipotético, no tick exato (cruzamento de médias, rompimento, RSI, Bollinger e o placar inteiro ficam exatos por construção). Alvo e stop saem de `computePlanLevels`; `computeHoldingLevels` faz a mesma conta para uma posição já comprada.
- **Alerta de preço no tick:** a API (que tem o ticker público) assina a porta `PriceTickListener`; o disparo é atômico no banco e enfileira o aviso do Telegram e emite o NOTIFY na mesma transação; o worker entrega o texto e a API entrega o aviso ao painel só ao dono. Alvo de prova: `make price-alerts-test`.
- **Seus ativos:** posição digitada, preço médio ponderado, venda limitada à quantidade, resumo com a regra do dia (`computeLatestTriggers` no estado `holding`).
- **Tetos por usuário (env):** `PRICE_ALERT_MAX_ENABLED_PER_USER` (padrão 50) e `USER_ASSET_MAX_PER_USER` (padrão 50).

## 5c. Tempo real (RF16)

> **Entregue na T4.4 e T4.7** (ADR 0001 §r, ADR 0002 "Tempo real"): o `LISTEN` usa escutador próprio porque o `Bun.SQL` 1.3.14 não o tem; o ticker usa `<par>@miniTicker`; o ticket é pedido com Bearer.

- **Preços não passam pelo banco.** A API abre UMA conexão com o stream combinado de ticker da Binance
  (`<par>@miniTicker`) para os pares habilitados, com reconexão e espera exponencial, e repassa pelo
  pub/sub nativo do `Bun.serve` (tópico `market:<PAR>`). Cada instância da API tem sua conexão; não há
  `LISTEN/NOTIFY` para ticks (alta frequência e dado público).
- Agregação no servidor: guarda o último tick por par e publica no máximo 1 vez por segundo por par.
- Mensagem de mercado: `{ type: 'tick', symbol, price, change24h, at }`. Mensagens de usuário (sinal,
  operação, saldo, alerta) seguem o canal `user:<userId>` do ADR 0001 (NOTIFY só com `runId`/`eventId`).
- O WebSocket autentica por ticket de uso único (ADR 0001). O cliente assina `market:*` e `user:*`; o
  servidor só aceita `user:` do próprio dono.
- Cliente: hook `useLiveMarket` mantém o último preço por par, calcula distâncias, valor dos ativos e
  progresso da meta no navegador, mostra o selo "ao vivo" / "sem dados há N s" e cai para polling
  de 15 s quando o WebSocket não conecta. Ao reconectar, rebusca o estado por REST.
- Alerta de preço (RF14) é avaliado no servidor a cada tick consolidado (o cliente nunca decide).

## 5d. Painel (T5.1 a T5.8)

`apps/frontend-cryptoada`: React 19 + Vite 8 + react-router 8 + TanStack Query 5. Sem biblioteca de componentes, de estilo
nem de PWA (o service worker `public/sw.js` é escrito à mão, guarda só a casca e nunca responde a `/v1`).

- **Sessão (token handler, ADR 0001 §a).** `SessionService` (`src/session/session-service.ts`) guarda o access token SÓ em
  memória; o refresh fica no cookie `__Host-cryptoada_refresh` que o JS nunca vê. Uma renovação por vez (as chamadas
  paralelas esperam a mesma promessa), renovação 30 s antes de vencer e `SessionStatus` em quatro estados: `loading`,
  `authenticated`, `anonymous` (401/400/403 da renovação) e `unavailable` (429, 5xx ou rede fora: NÃO é logout, a tela
  oferece "Tentar de novo"). O login é PKCE S256 feito pelo navegador (`login-redirect.ts`); o verifier fica em
  `sessionStorage` até o retorno e a tentativa é de uso único, queimada também por `state` diferente.
- **Cliente HTTP (`src/http/api-client.ts`).** `Authorization: Bearer`, `X-Requested-With: fetch` em toda chamada, um 401
  renova UMA vez e repete, o segundo 401 encerra a sessão local (a rota protegida leva ao login). TODA resposta é validada
  por Zod no cliente (envelope, página e dado): resposta de API é entrada não confiável.
- **Rotas.** `/login`, `/auth/callback`, `/` (visão geral) e `/conta`; tudo nasce sob `RootLayout`, que traz o AVISO
  PERMANENTE DE SIMULAÇÃO (texto fixo em `SIMULATION_NOTICE`, sem botão de fechar) em todas as rotas, inclusive 404.
- **Conta (T5.1b).** Tema (automático/claro/escuro, só no navegador), alertas do Telegram (`PATCH /v1/me`), vínculo do
  Telegram (código de uso único), exportar (`GET /v1/me/export` como download) e apagar (digitar o e-mail do token; `403
  REAUTH_REQUIRED` pede novo login; no `202` a sessão local é encerrada).
- **Visão geral (T5.2).** Uma ideia por cartão: saldo e resultado × comprar e segurar da simulação ao vivo ativa (estado
  "Rodando", "Aguardando dados do mercado" ou "Na fila"), últimos sinais com o motivo, um cartão por moeda
  (`VITE_MARKET_SYMBOLS`, padrão `BTCUSDT,ETHUSDT`) com o último fechamento de `1h` e a variação de 24 h, e o crédito
  "Fear & Greed Index por alternative.me" com link `rel="noopener noreferrer"` (RF01, D14). O valor do índice vem de
  `GET /v1/market/sentiment` (T5.8).
- **Último ponto sem varrer a série (T5.3).** `GET /v1/runs/:id/equity` e `/signals` aceitam `order=desc` (padrão `asc`; nas
  outras séries o parâmetro é `400`): a primeira página já é o ponto mais recente. A visão geral lê UMA página decrescente de
  100 (saldo de agora e curva recente) e filtra o neutro dos sinais; a curva inteira de um backtest vem do CSV do registro
  (`export.csv?table=equity`, uma chamada) e é reduzida a no máximo 240 pontos.
- **Backtests (T5.3).** `/backtests` cria (estratégia e versão, par, timeframe, período em datas UTC, capital, taxa e slippage
  com os padrões da API; o risco por operação é da VERSÃO e aparece só como nota), lista por cursor (backtests e walk-forwards
  em listas separadas, que acompanham sozinhas as execuções na fila ou rodando) e marca duas concluídas para comparar. O
  detalhe (`/backtests/:id`) mostra a posição na fila e o progresso por polling de 2 s, cancela (`POST .../stop`), e na
  conclusão traz métricas (valor indisponível diz o motivo, nunca zero), curva SVG escrita à mão (retorno acumulado × comprar e
  segurar), operações por cursor e os custos incluídos. A comparação (`/backtests/comparar?a=&b=`) põe comprar e segurar e as
  duas execuções lado a lado, avisa quando par ou período diferem e explica os custos sem prometer nada.
- **Estratégias (T5.4).** `/estrategias` lista, duplica (toda estratégia nasce de uma cópia: a API pede a configuração inteira)
  e apaga (exclusão lógica; o exemplo não se apaga). `/estrategias/:id` edita os números e decimais da versão-base em formulário
  gerado da própria configuração (ids, tipos e `schemaVersion` ficam de fora), salva SEMPRE como versão nova (a API devolve a
  mesma versão, `200`, se nada mudou, e o painel diz isso) mostrando versão e hash curto, lista as versões (cada uma pode virar
  a base) e pede o walk-forward com uma grade de até 3 parâmetros do catálogo e o teto de 200 combinações conferido antes de
  enviar. O relatório fora da amostra e o alerta de sobreajuste vêm no mesmo detalhe de execução.
- **Alertas e tempo real (T5.5).** `/alertas` mostra o histórico de compra e venda da simulação ao vivo (mais novo primeiro),
  os alertas de preço disparados (com "Limpar disparados", que chama `DELETE /v1/price-alerts/fired`) e as preferências. O
  painel autenticado abre UM WebSocket (`src/live/`): ticket de uso único por `POST /v1/stream/tickets`, `Origin` da própria
  origem, renovação dentro do socket antes de o token vencer (sessão renovada antes do ticket), reconexão com espera
  crescente (teto de 30 s), `4401` reconecta na hora, `4403` para de vez ("Conta inativa") e todo `resync` ou reconexão rebusca
  por REST (o aviso só diz o que mudou). O selo do cabeçalho mostra "Ao vivo", "Reconectando…" ou "Conta inativa".
- **Metas (T5.6).** `/metas` declara a meta (par, retorno alvo %, prazo em dias, perda máxima %): a porcentagem vira fração
  MOVENDO A VÍRGULA NO TEXTO (`percentToFraction`, nunca `Number`), então `2.5` vira `"0.025"` exato. `/metas/:goalId` lê
  `GET /v1/goals/:id/evaluation` e mostra o ranking estratégia × moeda (taxa de chegada ao alvo sobre as N janelas, taxa de
  stop, tempo típico, comprar e segurar ao lado e a régua COMPRAR/SEGURAR/EVITAR) com o aviso fixo de que é HISTÓRICO e não
  promessa. "Simular esta meta" cria um `live_paper` com `goalId` (só para o par da meta: a API recusa outro) e leva ao painel,
  onde o cartão "Meta ativa" mostra retorno, progresso até o alvo e até a perda máxima, dias restantes, ritmo e, encerrada, o
  desfecho. Cada moeda mostra a situação e o PRÓXIMO GATILHO por família (a regra ainda não cumprida mais perto de votar).
  Campos que o motor deixa nulos (janela vazia, sentimento sem observação) aparecem em palavras, nunca derrubam a tela.
- **Plano, alertas e ativos (T5.7).** `/metas/:goalId/plano?strategyId=` desenha à mão, em SVG, o preço dos últimos 60 dias e
  as linhas de compra, alvo, stop e preço de agora (`mapPlanChart` é a escala pura), com os níveis em texto, o prazo e a base
  (exato ou indicativo). "Avisar no plano" cria o alerta com `origin: plan`, do lado de onde o preço vem. `/alertas` ganhou o
  quadro de alertas de preço (criar, ligar, desligar, religar o disparado, apagar). `/ativos` ("Seus ativos") registra compra,
  venda ou posição (o preço médio ponderado é da API), mostra valor em USDT, resultado, regra do dia pela estratégia escolhida
  (padrão: a primeira da lista; a API só calcula a regra com `strategyId`), alvo e stop. **Não há fonte de câmbio no produto:**
  a cotação USDT→R$ é a que o usuário digita, guardada só no `localStorage` deste navegador, e só multiplica na tela.
- **Tempo real e sentimento (T5.8, RF16).** `src/live/`: `MarketStore` (fora do React) guarda o último tick de cada par e só quem
  lê o preço re-renderiza; `computeMarketState` diz `live`, `waiting`, `stale` ou `offline` (socket fora, ou 10 s sem tick, ou
  todos os pares selados pelo servidor). O selo mostra "Preços ao vivo" ou "Sem dados há N s". Com o socket vivo o preço vem
  pelos ticks; fora dele (ou velho) o REST é consultado de 15 em 15 s (cartões de moeda e resumo de ativos), e a volta
  rebusca tudo (`resync`). Preço, plano, ativos e alertas se atualizam sozinhos; o aviso `price_alert` refaz a lista. A
  visão geral mostra o Fear & Greed de `GET /v1/market/sentiment` com o crédito "Fear & Greed Index por alternative.me" e o link.
- **Build e segurança.** `vite build` injeta CSP por `<meta>` só no build (`default-src 'self'`, sem `unsafe-inline` nem
  `unsafe-eval`); `VITE_*` é público e só leva URL do Keycloak, `client_id` público e lista de pares. Dev e preview servem
  na origem do painel com proxy de `/v1` (cookie `__Host-` não atravessa origens).
- **Provas.** `bun run --cwd apps/frontend-cryptoada test` (contratos com happy-dom, lista de arquivos explícita no
  `package.json`, dentro do `make check`) e `make panel-e2e` (Playwright contra API, Postgres e Keycloak reais de teste,
  seed por repositórios, Telegram falso, sem mock da API).

## 6. API (etapa 1)

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/v1/markets/candles?symbol&timeframe&from&to` | Candles para gráfico (pares e timeframes habilitados; `from` incluído, `to` excluído; até 5.000; texto decimal; 60/min) |
| `GET` | `/v1/market/sentiment` | (T5.8) Último Fear & Greed gravado em `sentiment_daily` (`fearGreed`, `classification`, `date`) com o objeto `source` (`name`, `creditText`, `url`) que o painel exibe como crédito (RF01, D14); sem dado ⇒ `404 SENTIMENT_NOT_AVAILABLE`; só leitura, sem dono |
| `GET/POST` | `/v1/strategies` | Listar (por cursor) / criar (nome + configuração validada pelo motor; cria a versão 1) |
| `DELETE` | `/v1/strategies/:id` | (T5.4) Apaga (exclusão lógica: some da lista e do detalhe, execuções e resultados ficam); `204`; a de exemplo é `409 STRATEGY_IS_EXAMPLE`; alheia = `404` idêntico |
| `GET` | `/v1/strategies/:id` | Estratégia com a versão mais recente (a versão traz `configHash`, o SHA-256 canônico da configuração, desde a T5.4) |
| `GET/POST` | `/v1/strategies/:id/versions` | Listar versões (da mais nova) / nova versão (configuração igual ⇒ a MESMA versão, `200`; nova ⇒ `201`) |
| `POST` | `/v1/runs` | Criar backtest ou walk-forward (valida parâmetros, grade e janelas ANTES de aceitar, grava o pedido, enfileira, `202`); fila do usuário cheia ⇒ `429 RUN_QUEUE_FULL`; `live_paper` (T4.1) não leva período: nasce `queued` no candle em curso, sem fim, o worker a reivindica; aceita `survival: { floorRate, doubleRate }` (T4.3; padrão 0,8 e 2) e `goalId` (T4b.4: meta do dono, ligada e do mesmo par; `GET /v1/runs/:id` devolve `goalId` e `goalOutcome`); `409 LIVE_RUN_LIMIT_REACHED` acima do teto de ativas; 20/min |
| `GET/POST` | `/v1/goals` | (T4b.3, RF13) Listar por cursor / criar meta (`symbol`, `targetRate`, `maxLossRate`, `horizonDays`); teto de 20 (`409 GOAL_LIMIT_REACHED`) |
| `GET/PATCH/DELETE` | `/v1/goals/:goalId` | Ler / alterar parcialmente / apagar (`409 GOAL_IN_USE` se há simulação) |
| `GET` | `/v1/goals/:goalId/evaluation` | Ranking estratégia × par com veredito `COMPRAR`/`SEGURAR`/`EVITAR` e situação atual (sinal e próximos gatilhos), em `1d`, com cache; 20/min |
| `GET` | `/v1/goals/:goalId/plan?strategyId` | (T4b.5, RF13) Plano de operação: preço de compra e de saída no tick (o fechamento do próximo candle que faz o placar e cada regra sinalizarem), alvo e stop de venda com taxas e slippage, data limite e a base `exact`/`indicative`; `strategyId` obrigatório (400), meta ou estratégia alheia = 404 idêntico; cache por último candle; 20/min |
| `GET/POST` | `/v1/price-alerts` | (T4b.6, RF14) Listar por cursor / criar (`symbol`, `direction`, `value`, `origin` `manual`\|`plan`); teto de alertas ligados (`409 PRICE_ALERT_LIMIT_REACHED`) |
| `DELETE` | `/v1/price-alerts/fired` | (T5.5, pendência da T4b.6) Apaga de uma vez os alertas já disparados do usuário e devolve `{ deleted }`; armados e desligados à mão ficam |
| `GET/PATCH/DELETE` | `/v1/price-alerts/:alertId` | Ler / alterar parcialmente (`direction`, `value`, `isEnabled`; religar rearma e respeita o teto) / apagar; alheio = 404 idêntico |
| `GET` | `/v1/assets` · `/v1/assets/summary` | (T4b.8, RF15) Ativos do usuário por cursor (ordem do par) / resumo: valor atual (USDT), custo, resultado, alvo e stop sobre o preço médio (`targetRate`, `stopRate`), regra do dia (`strategyId` opcional); 20/min |
| `GET/PUT/PATCH/DELETE` | `/v1/assets/:symbol` | Ler / cadastrar (posição digitada) / `{ side: 'buy', quantity, price }` soma e pondera o médio, `{ side: 'sell', quantity }` desconta (`409 ASSET_INSUFFICIENT_QUANTITY`) / apagar; teto `409 ASSET_LIMIT_REACHED`; alheio = 404 idêntico |
| `GET` | `/v1/runs` | Execuções do dono, por cursor (filtro `kind`) |
| `GET` | `/v1/runs/:id` | Status, progresso, métricas, alerta de overfitting, avisos, `queuePosition` (`{ own, overall }` só para `queued`) e, na simulação ao vivo, `survival` (T4.3, RF09): piso e meta de dobro, o tempo até cada um quando atingido e o progresso enquanto não (ADR 0002 "Sobrevivência do saldo (T4.3)") |
| `GET` | `/v1/runs/:id/equity` · `/trades` · `/signals` · `/orders` · `/fills` · `/windows` | Séries do painel, por cursor (`/windows` só no walk-forward). `equity` e `signals` aceitam `order=asc\|desc` (T5.3; `desc` começa pelo mais recente, nas outras séries é `400`) |
| `POST` | `/v1/runs/:id/stop` | Cancelar execução `queued`/`running`, inclusive a simulação ao vivo (idempotente; `409` se já terminou) |
| `GET` | `/v1/runs/:id/export.csv?table=trades\|signals\|fills\|equity\|windows` | Registro em CSV, em fluxo, com proteção contra injeção de fórmula |
| `GET` | `/v1/runs/:id/log.csv` | (T4.6, RF12) Registro cronológico — sinais com o motivo, ordens e preenchimentos numa linha do tempo só (no mesmo candle: preenchimento, sinal, ordem) —, em fluxo por páginas, só do dono, cabeçalho fixo de 21 colunas, tempos em UTC ISO, decimais em texto exato, proteção contra injeção de fórmula; cota do `export.csv` |
| `GET` | `/v1/openapi.json` · `/v1/docs` | OpenAPI 3.1 gerado das rotas e página do Scalar — SÓ fora de produção |
| `WS` | `/v1/stream` | Sinal, operação e saldo em tempo real — só do usuário do token |
| `GET/PATCH` | `/v1/me` | Perfil e preferências |
| `POST/DELETE` | `/v1/me/telegram-link` | Gera código de vínculo do Telegram / desvincula o chat |
| `POST` | `/v1/telegram/webhook` | Webhook do bot (público, protegido pelo segredo `X-Telegram-Bot-Api-Secret-Token`; só existe com segredo configurado) |
| `GET` | `/v1/me/export` · `DELETE /v1/me` | LGPD: exportar e apagar a conta |
| `POST` | `/v1/session` | Troca o código do login (PKCE) por access token; refresh em cookie `__Host-` (*token handler*) |
| `POST` | `/v1/session/refresh` | Renova o access token pelo cookie, com rotação do refresh |
| `DELETE` | `/v1/session` | Logout no Keycloak e apaga o cookie |
| `POST` | `/v1/stream/tickets` | Ticket de uso único (30 s) para o handshake do WebSocket |
| `POST` | `/v1/admin/invitations` | Convidar usuário (papel `admin`, `acr ≥ 2`) |
| `GET` | `/v1/admin/health` | Saúde do sistema e da fila de execuções (`queued`/`running` por tipo), só números agregados |
| `GET` | `/v1/admin/accounts` | Contas com dados mínimos (e-mail do Keycloak, estado, datas) |
| `POST` | `/v1/admin/accounts/:accountId/block` · `/unblock` | Bloquear e desbloquear conta (nunca a si mesmo nem o último admin) |

Toda rota declara `access` (`public`/`user`/`admin`) e o roteador nega por padrão; só o health e as
rotas de sessão são públicas. `/v1/admin/*` exige `acr ≥ 2`. O WebSocket autentica no handshake pelo
ticket, fecha no `exp` do token com `4401` a menos que o painel renove o token por mensagem dentro do
socket, e fecha com `4403` quando a conta é bloqueada ou apagada. Recurso de outro usuário responde
`404` com o mesmo `<RESOURCE>_NOT_FOUND` de recurso inexistente (ADR 0001 §e).

Envelope `{ data }` / `{ error: { code, message, details? } }`; listas levam `pagination: { nextCursor, perPage }` (cursor
opaco, `limit` 1 a 100). O OpenAPI 3.1 é GERADO da tabela de rotas e servido com Scalar `1.72.1` fora de produção (ADR 0002,
"Rotas REST de mercado, estratégias e execuções (T3.4)"); toda rota declara a própria documentação e o gerador recusa rota sem ela.

## 7. Testes

- **Contrato do motor**: indicadores contra valores de referência; sem lookahead (mutar candle
  futuro não muda decisão passada); determinismo; stop antes de alvo; taxa e slippage aplicados.
  Todo motor passa `runEngineContract` (`test/fixtures/strategy-engine/engine-contract.fixture.ts`, ADR
  0002 §g, 20 verificações em sete cenários) e todo indicador passa `expectIndicatorContract`; o harness
  é provado por 26 motores defeituosos que ele reprova pela verificação certa. A T2.5 acrescenta o teste
  diferencial do `FillModel` (produção × referência, mesmo fluxo, saída idêntica) e o golden do Placar
  clássico preso à `engineVersion`.
- **Paridade**: o mesmo período rodado em modo backtest e em modo ao vivo reproduzido produz
  operações idênticas.
- **Integração**: backfill com lacuna; worker reinicia sem duplicar operação; NOTIFY chega ao WS.
- **Isolamento**: para cada rota com recurso de usuário, contrato negativo (B tenta o recurso de A →
  `404`); WS de B não recebe evento de A.
- **E2E (Playwright)**: login, criar backtest, ver resultado, comparar versões.

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Overfitting dar falsa confiança | Walk-forward obrigatório e relatório fora da amostra como principal |
| Divergência backtest × ao vivo | Motor único + teste de paridade |
| Rate limit da Binance no backfill | Controle de peso por minuto, backoff, retomada |
| Indicador próprio divergir da referência externa | `trading-signals` como oráculo nos testes da T2.2 (tolerância declarada por indicador) |
| WebSocket da Binance cair | Reconexão com backoff e backfill da lacuna pelo REST |
| Um usuário ver dado de outro | D11 (filtro obrigatório no tipo) + contrato negativo por rota |
| Walk-forward de um usuário travar os outros | Fila durável no banco com tetos por usuário e tipo, round-robin entre usuários e teto global por instância (RF00b, T3.6) |

## 9. Correções da auditoria T6.2

A auditoria de segurança da T6.2 (`evidence.md`) aprovou com ressalvas para uso interno fechado e listou A1–A3, M1–M5 e baixos. Corrigidos em código: A1 (avaliação de metas em pool de threads com portão e orçamento a frio), A2 (tetos de estratégias, versões, alertas desligados e execuções guardadas; `DELETE /v1/runs/:id` lógico; exportação LGPD em NDJSON paginado), M1 (`verify-full`, CA própria, SCRAM com piso/teto e `-PLUS`), M3, M4 (parte de código), M5 e os baixos B1, B6 e documentação por lista. Decisões e provas em ADR 0001 §v e ADR 0002 "Metas: CPU fora da thread da API". Ficam com o responsável: M2 (cifra do `telegram_chat_id`), A3 (CI, deploy, réplica única, `TRUSTED_PROXY_HOPS`), cabeçalhos HTTP da borda do painel (M4, plataforma) e a purga de retenção proposta no ADR.

