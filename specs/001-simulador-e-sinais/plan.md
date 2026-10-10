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
| `packages/market-data` | Cliente REST de klines da Binance (`fetchKlines`, `fetchKlinesRange`): resposta validada com Zod, candle aberto descartado, controle de peso (`x-mbx-used-weight-1m`), 429/418 e backoff; compartilhado por cron e worker. Base `https://data-api.binance.vision` (host só de dados de mercado públicos, sem chave nem restrição de região, indicado pela documentação da Binance); `https://api.binance.com` é a alternativa e a base é parâmetro do cliente. `createKlineStream` (T1.5) abre o stream combinado de klines `wss://data-stream.binance.vision/stream?streams=btcusdt@kline_1h/...` (mesmo host só de dados de mercado, sem user data stream; símbolos em minúsculas; envelope `{ stream, data: { e: 'kline', E, s, k: { t, T, s, i, o, c, h, l, v, n, x, ... } } }`, `x` booleano = vela fechada): valida cada mensagem com Zod, entrega só `x === true` como `Candle` com preços string, descarta o resto contando (sem eco da mensagem), reconecta com backoff exponencial + jitter, vigia silêncio (`staleAfterMilliseconds`, padrão 60 s; a Binance envia ping a cada 20 s) e trata a desconexão forçada de 24 h como queda normal; URL base é parâmetro |
| `apps/cron-cryptoada` | One-shot agendado: exclusão de contas (passos 2 e 3 e remoção da linha de `users`, ADR 0001 §h; retenção de 90 dias do IP da auditoria), backfill de candles (`backfill-candles`: por par, em sequência, janela de `BACKFILL_YEARS` alinhada à grade, lacunas por `findMissingOpenTimes` em SQL, uma página gravada por vez; `MARKET_EXCHANGE`, `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BACKFILL_YEARS`, `BINANCE_BASE_URL`, `CRON_TASKS`; prova em `make backfill-test`), correção de lacunas, Fear & Greed |
| `apps/worker-cryptoada` | Consome o stream de klines; no candle fechado, avalia as simulações ativas, grava e notifica. Etapa T1.5 (já ativa, endurecida na T1.6): cada vela fechada vai para `upsertCandles` (idempotente; escrita que falha repete 3 vezes com backoff e então dispara a recuperação) e a recuperação de lacuna baixa pelo REST só as aberturas que faltam numa JANELA DE RETROCESSO `[agora - STREAM_GAP_LOOKBACK_HOURS, última vela fechada)` (`findMissingOpenTimes`, por par, em sequência), em CADA (re)conexão e a cada `STREAM_GAP_CHECK_MINUTES`; falha agenda nova tentativa com backoff sem parar o stream; 418 faz dormir o `Retry-After` (teto 24 h) sem seguir pelos pares; par sem nenhum candle fica para o backfill do cron. A hora de corte vem do relógio do servidor (`createServerClock`, `GET /api/v3/time`). Variáveis: `MARKET_EXCHANGE` (só `binance`), `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BINANCE_BASE_URL` (REST), `BINANCE_STREAM_URL` (`wss://` em produção), `STREAM_STALE_SECONDS` (5 a 600, padrão 60), `STREAM_GAP_LOOKBACK_HOURS` (1 a 720, padrão 168), `STREAM_GAP_CHECK_MINUTES` (1 a 1440, padrão 15). Prova: `make stream-test` (worker real em subprocesso, Postgres descartável, Binance falsa REST + WebSocket) |
| `apps/api-cryptoada` | `Bun.serve`: REST, WebSocket para o painel, backtest e walk-forward em `worker_thread` |
| `apps/frontend-cryptoada` | React 19 + Vite, PWA |

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
| D14 | Fear & Greed vem da alternative.me (`sync-fear-greed` no cron, `sentiment_daily`). Os termos exigem crédito: a T5.2, e qualquer tela que exiba o índice, mostra "Fear & Greed Index por alternative.me" com link para https://alternative.me/crypto/fear-and-greed-index/ (RF01) | Termos de uso da fonte; sem o crédito o índice não pode aparecer |

## 3. Modelo de dados

| Tabela | Campos principais |
|---|---|
| `candles` | `exchange`, `symbol`, `timeframe`, `open_time` bigint em ms (PK composta, cobre a leitura do mais recente), `close_time`, `open/high/low/close numeric(24,8)`, `volume numeric(32,8)`, `trade_count`, `created_at`; CHECK `close_time > open_time`, `high >= low`, `open` e `close` entre `low` e `high` (migration 0006), `timeframe in ('15m','1h','4h','1d')`. Candle fechado é imutável (`ON CONFLICT DO NOTHING`); candle aberto (`close_time` além de agora + 5 s de tolerância de relógio) é rejeitado pelo repositório. Leitura por `[from, to)` |
| `sentiment_daily` | `date` PK, `fear_greed smallint` (CHECK 0..100), `classification` varchar nulo, `created_at`; o valor do dia é atualizado (`DO UPDATE`) — **só para exibição**, o motor não lê daqui |
| `sentiment_observations` | (T3.1, migration 0008) **dado público**, sem `user_id`, append-only e imutável: `id uuid`, `date`, `fear_greed smallint` (CHECK 0..100), `observed_at` bigint em ms (instante em que o valor ficou DISPONÍVEL: coleta ao vivo, ou data + atraso de publicação conservador configurável no cron, padrão 24 h, no histórico), `source varchar(64)` (inclui a regra do atraso), `created_at timestamptz`; único (`source`, `date`, `observed_at`). **`created_at` é o instante em que o valor ficou conhecido**: na carga histórica, o instante ESTIMADO de publicação (o repositório aceita `createdAt` explícito), nunca o horário da carga; ao vivo, o relógio do banco. Gatilho `BEFORE UPDATE OR DELETE` (por linha) e `BEFORE TRUNCATE` rejeitam a alteração com `sentiment_observations é append-only`. É a fonte do motor (ADR 0002 §f): o motor lê só a `source` da execução (`RunParameters.sentimentSource`, dentro do `run_hash`); `findAvailableAt({ source, observedUntil, insertedUntil })` devolve a última linha da fonte com `observed_at ≤ observedUntil` **e** `created_at ≤ insertedUntil` (empate em `observed_at`: a inserida por último), e `listAvailable` devolve a série elegível em ordem. Paridade: o backtest usa a fonte coletada AO VIVO quando existir para o período, e a histórica só onde faltar; mudar o atraso gera linhas novas, nunca reescreve |
| `users` | `id uuid`, `keycloak_sub varchar(255)` (único), `display_name`, `display_currency`, `timezone`, `telegram_chat_id` (nulo até vincular; único quando preenchido), `alert_telegram_enabled`, `limits jsonb`, `created_at`, `updated_at`, `blocked_at`, `deleted_at`, `identity_deleted_at`, `data_purged_at` (ADR 0001 §d, §h) |
| `telegram_link_codes` | `id`, `user_id` (único), `code_hash` (único), `expires_at`, `attempts`, `created_at` — vínculo do chat por código de uso único; só o hash é guardado |
| `strategies` | (T3.1, migration 0007) `id uuid` v7, `user_id`, `name varchar(120)`, `is_example bool`, `created_at`, `updated_at`, `deleted_at` nulo (soft delete: a estratégia some da listagem e não aceita versão nova, as versões e execuções ficam); `UNIQUE (id, user_id)` |
| `strategy_versions` | (T3.1) `id uuid`, `user_id`, `strategy_id` (FK composta `(strategy_id, user_id)`), `version int ≥ 1`, `config jsonb`, `config_hash varchar(64)` (CHECK SHA-256 hexadecimal), `created_at`; único (`strategy_id`, `version`) e único (`strategy_id`, `config_hash`): **configuração igual (mesmo hash) devolve a MESMA versão**, nunca uma nova (`addVersion` é idempotente; o `FOR UPDATE` na estratégia serializa a numeração); `UNIQUE (id, user_id)` |
| `runs` | (T3.1) `id uuid`, `user_id`, `strategy_version_id` (FK composta), `kind varchar` (`backtest`/`walk_forward`/`live_paper`, CHECK), `status varchar` (`queued`/`running`/`completed`/`failed`/`cancelled`, CHECK; só avança: `queued → running → completed`, `queued|running → failed|cancelled`; estado final não muda), `symbol`, `timeframe` (CHECK nos quatro), `run_parameters jsonb`, `run_hash varchar(64)`, `engine_version`, `signal_engine_version`, `metrics_version`, `period_start` bigint, `period_end` bigint **nulo** (o ao vivo não tem fim), `engine_state jsonb` nulo (checkpoint do motor), `last_candle_time` (monotônico), `metrics jsonb` nulo, `progress int 0..100`, `error_code` nulo, `migrated_from_run_id uuid` nulo (FK composta para `runs`: a execução que esta replicou com outro motor; a antiga fica imutável — ADR 0002 §b), `created_at`, `started_at`, `finished_at` (CHECK: preenchido se e só se o status é final); `UNIQUE (id, user_id)`. Os campos copiados `initial_balance`/`fee_rate`/`slippage_rate` do desenho antigo saíram: a fonte é `run_parameters` |
| `run_commands` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `command_id varchar(64)` (único com `run_id`), `kind` (`exit_position`/`halt`/`resume`), `reason`, `issued_at` bigint, `candle_time` bigint (candle em cujo fechamento agiu), `status` (`applied`/`ignored_duplicate`) — entrada persistida do passo e trilha; `DO NOTHING`: o primeiro registro do `command_id` vale |
| `signals` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `candle_time` bigint, `action` (`BUY`/`SELL`/`HOLD`), `score numeric`, `regime` (`trending`/`ranging`/`none`), `votes jsonb`, `indicators jsonb` (ids com espaço de nome, achatados), `sentiment_observation jsonb` nulo (a observação usada: valor, `observed_at`, fonte), `reason text` · único (`run_id`, `candle_time`), `INSERT … ON CONFLICT DO NOTHING` (imutável) |
| `orders` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `engine_key varchar(64)` (único com `run_id`; `w<índice>:order-N` no walk-forward, sem colisão entre janelas), `side`, `type` (`market`/`limit`/`stop`/`target`), `purpose` (`entry`/`exit`), `status` (`created`/`filled`/`cancelled`/`expired`/`rejected`), `reason` nulo (`below_min_notional`, `zero_atr`, `invalid_stop`, `opposite_signal`, `command`, `gap`, `volume_capped`), `quantity`, `price`, `limit_price`, `trigger_price`, `risk_amount`, `stop_distance`, `target_distance` (todos `numeric` nulos), `eligible_candles`, `created_candle_time`, `expires_candle_time` nulo, `last_event_candle_time` · `INSERT … ON CONFLICT (run_id, engine_key) DO UPDATE … WHERE` o status novo é posterior ao gravado e o dono é o mesmo (monotônico: `created` < qualquer estado final; um final nunca vira outro final nem volta a `created`); os campos nulos do evento novo não apagam o que o anterior trouxe (`coalesce`) |
| `fills` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `order_key`, `position_key`, `candle_time`, `side`, `price`, `quantity`, `notional`, `fee numeric` · único (`run_id`, `order_key`, `candle_time`), `DO NOTHING` |
| `positions` | (T3.1) `id uuid`, `user_id`, `run_id` (FK composta), `engine_key varchar(64)` (único com `run_id`), `status` (`open`/`closed`), `entry_price`, `quantity`, `stop_price`, `target_price`, `entry_fee` e, na posição fechada, `exit_price`, `exit_fee`, `net_profit`, `exit_reason` (`stop`/`target`/`signal`/`command`/`gap`), `closed_candle_time` (CHECK: fechada exige todos), `opened_candle_time` · upsert monotônico `open` < `closed` (fechada não reabre nem perde a saída) |
| `equity_points` | (T3.1) `user_id`, `run_id` (FK composta), `candle_time`, `equity numeric`, `equity_at_low numeric` (liquidação na mínima do candle: perda máxima da meta e piso do RF09), `benchmark numeric` · PK (`run_id`, `candle_time`), `DO NOTHING` (imutável) |
| `walk_forward_windows` | `user_id`, `run_id`, `index`, `train_start/end`, `test_start/end`, `best_params jsonb`, `in_sample jsonb`, `out_of_sample jsonb` |
| `alerts` | `id uuid`, `signal_id`, `channel`, `sent_at`, `status` |
| `price_alerts` | `id uuid`, `user_id`, `symbol`, `direction`, `value numeric`, `origin`, `is_enabled`, `triggered_at` (RF14) |
| `user_assets` | `id uuid`, `user_id`, `symbol`, `quantity numeric`, `average_price numeric` (RF15) |
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
linhas). Migração do motor segue o ADR 0002 §b: nova execução com `migrated_from_run_id`. A única operação
sem dono é `failOrphanedRuns` (boot, T3.6): marca `running` de `backtest`/`walk_forward` como `failed` e
devolve só a contagem; a simulação ao vivo (`live_paper`) nunca é tocada. A transação POR PASSO do ao vivo
(decisões + `engine_state` + `last_candle_time`) exige gravar resultados e checkpoint na mesma transação:
os repositórios aceitam hoje cada parte separada; a composição é da T4.1.

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

- Janelas: ajuste 6 meses, teste 2 meses, passo 2 meses.
- Objetivo da busca: Sharpe fora de taxa e slippage, com mínimo de 10 operações na janela.
- **Alerta de overfitting**: Sharpe fora da amostra < 50% do de dentro, ou fora da amostra negativo
  com dentro positivo.
- Taxa de acerto exibida nos alertas = acerto fora da amostra do último walk-forward da versão.

## 5b. Metas (RF13)

- `evaluateGoal` no `strategy-engine`: para cada (estratégia, par), roda janelas de `prazo` dias
  com passo de 2 dias sobre 2 anos. A saída por meta **age no fechamento** do candle em que o
  `equityPoint` atinge o alvo ou a perda máxima (esta medida no `equityAtLow`, lado pior) e **executa
  em `t+1`** (comando `exit_position`, ADR 0002 §h) — nunca no preço do alvo. Puro e determinístico;
  mesmo motor do backtest.
- Custo, com as metades do motor (ADR 0002 §a): os SINAIS de cada (estratégia, par) são calculados UMA
  vez em série contínua (`signalStep`, ~17,5 mil passos em `1h` para 2 anos); cada janela roda só a
  carteira (`walletStep`, sem indicadores) sobre os sinais já calculados. Em `1h`: 5 pares × 4
  estratégias × ~335 janelas × 30 dias × 24 candles ≈ 4,8 milhões de passos de carteira (a conta antiga
  de "200 mil passos" supunha candle diário) + 20 × 17,5 mil ≈ 350 mil passos de sinal. Passo de carteira
  é aritmética decimal de poucas ordens: meta de 2 µs a 5 µs, ~10 s a 25 s no `worker_thread`, medida na
  T4b.1 (em `1d` fica abaixo de 1 s). Resultado guardado em cache por (versão da estratégia, par,
  timeframe, meta, dia do último candle); se a medida não couber, a T4b.1 reduz o passo das janelas ou
  restringe a meta a `4h`/`1d`.
- "Próximo gatilho" é função pura por família: distância entre o valor atual do indicador e o limiar
  que dispara o voto (ex.: média 9 a 1,2% da 21; máxima de 20 dias 4% acima do preço).
- Tabela `goals`: `id uuid`, `user_id`, `target_rate numeric`, `horizon_days`, `max_loss_rate numeric`,
  `amount numeric`, `strategy_version_id`, `symbol`, `run_id` (simulação ao vivo com meta),
  `status varchar` (`active`/`reached`/`stopped`/`expired`), `created_at`, `ended_at`.
- Rotas: `POST /v1/goals/evaluate` (sem gravar, devolve o ranking), `POST /v1/goals` (inicia a
  simulação com meta), `GET /v1/goals`, `GET /v1/goals/:id`.

## 5c. Tempo real (RF16)

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

## 6. API (etapa 1)

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/v1/markets/candles?symbol&timeframe&from&to` | Candles para gráfico |
| `GET/POST` | `/v1/strategies` | Listar / criar |
| `POST` | `/v1/strategies/:id/versions` | Nova versão |
| `POST` | `/v1/runs` | Criar backtest, walk-forward ou simulação ao vivo |
| `GET` | `/v1/runs/:id` | Status e métricas |
| `GET` | `/v1/runs/:id/equity` · `/trades` · `/signals` | Séries do painel |
| `POST` | `/v1/runs/:id/stop` | Parar simulação ao vivo |
| `GET` | `/v1/runs/:id/export.csv` | Registro completo |
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
| `GET` | `/v1/admin/health` | Saúde do sistema, só números agregados |
| `GET` | `/v1/admin/accounts` | Contas com dados mínimos (e-mail do Keycloak, estado, datas) |
| `POST` | `/v1/admin/accounts/:accountId/block` · `/unblock` | Bloquear e desbloquear conta (nunca a si mesmo nem o último admin) |

Toda rota declara `access` (`public`/`user`/`admin`) e o roteador nega por padrão; só o health e as
rotas de sessão são públicas. `/v1/admin/*` exige `acr ≥ 2`. O WebSocket autentica no handshake pelo
ticket, fecha no `exp` do token com `4401` a menos que o painel renove o token por mensagem dentro do
socket, e fecha com `4403` quando a conta é bloqueada ou apagada. Recurso de outro usuário responde
`404` com o mesmo `<RESOURCE>_NOT_FOUND` de recurso inexistente (ADR 0001 §e).

Envelope `{ data }` / `{ error: { code, message } }`. OpenAPI gerado das rotas, servido com Scalar
fora de produção.

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
| Walk-forward de um usuário travar os outros | Fila de jobs com teto por usuário (RF00b) |
