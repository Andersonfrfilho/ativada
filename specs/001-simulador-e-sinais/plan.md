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
| `packages/strategy-engine` | Puro, sem I/O: indicadores, votos, regime, risco, corretora simulada, métricas, walk-forward |
| `packages/database` | Drizzle (driver `Bun.sql`), schema, migrations com `rollback.sql` obrigatório, cliente; usado por API, worker e cron |
| `packages/environment` | Validação Zod do ambiente (`parseEnvironment`, `runWithEnvironment`, `postgresUrlSchema`); lista todas as variáveis inválidas e nunca imprime valores |
| `packages/identity-admin` | Cliente da Admin API do Keycloak (service account `cryptoada-api-service`): convidar, bloquear, apagar e encerrar sessões de usuário; compartilhado pela API e pelo cron, porque uma app não importa código de outra (ADR 0001 §h) |
| `packages/market-data` | Cliente REST de klines da Binance (`fetchKlines`, `fetchKlinesRange`): resposta validada com Zod, candle aberto descartado, controle de peso (`x-mbx-used-weight-1m`), 429/418 e backoff; compartilhado por cron e worker. Base `https://data-api.binance.vision` (host só de dados de mercado públicos, sem chave nem restrição de região, indicado pela documentação da Binance); `https://api.binance.com` é a alternativa e a base é parâmetro do cliente |
| `apps/cron-cryptoada` | One-shot agendado: exclusão de contas (passos 2 e 3 e remoção da linha de `users`, ADR 0001 §h; retenção de 90 dias do IP da auditoria), backfill de candles (`backfill-candles`: por par, em sequência, janela de `BACKFILL_YEARS` alinhada à grade, lacunas por `findMissingOpenTimes` em SQL, uma página gravada por vez; `MARKET_EXCHANGE`, `MARKET_SYMBOLS`, `MARKET_TIMEFRAMES`, `BACKFILL_YEARS`, `BINANCE_BASE_URL`, `CRON_TASKS`; prova em `make backfill-test`), correção de lacunas, Fear & Greed |
| `apps/worker-cryptoada` | Consome o stream de klines; no candle fechado, avalia as simulações ativas, grava e notifica |
| `apps/api-cryptoada` | `Bun.serve`: REST, WebSocket para o painel, backtest e walk-forward em `worker_thread` |
| `apps/frontend-cryptoada` | React 19 + Vite, PWA |

O motor é o mesmo para backtest e ao vivo: o backtest alimenta candles do banco num laço; o ao vivo
alimenta um candle por vez. A interface é uma só:

```ts
type EngineStep = (input: StepInput) => StepResult; // estado entra, estado sai — sem I/O
```

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | Bun + TypeScript estrito, monorepo com workspaces | Padrão do ecossistema |
| D2 | Postgres + Drizzle; candles em tabela com PK composta | Consulta por intervalo é o caso dominante |
| D3 | `decimal.js` para dinheiro e quantidade | Constituição §6 |
| D4 | Indicadores via `trading-signals` (TS nativo, mantido) — confirmar na T2.2 | Evitar reimplementar matemática; `technicalindicators` está sem manutenção |
| D5 | Sem fila externa na etapa 1: o stream da Binance é a entrada do worker; worker→API por `LISTEN/NOTIFY` | Multiusuário, mas uma instância de API e um worker na etapa 1: o volume cabe no Postgres e RabbitMQ seria peso sem ganho. Mais de uma instância exige ADR (estado em memória da API: rate limit, tickets, sockets) |
| D6 | Execução em `t+1` na abertura; stop antes do alvo no mesmo candle | Constituição §3 e §4 |
| D7 | Saldo em USDT; exibição em R$ pela cotação USDT/BRL do momento | Pares cotados em USDT têm mais liquidez e histórico |
| D8 | Telegram por Bot API direta (`fetch`), sem SDK | Dois métodos usados; dependência não se paga |
| D9 | Keycloak (OIDC) para login, com realm versionado em `realm/`; a API valida o JWT pela JWKS com a biblioteca `jose` na versão exata `6.2.12` (dependência prevista, instalada na T0.7) e faz o papel de *token handler* com cliente confidencial (ADR 0001) | Senha, recuperação, verificação de e-mail e TOTP prontos; mesma pilha já usada no ecossistema |
| D10 | Tabela `users` local espelha o `sub` do Keycloak (criada no primeiro acesso) e guarda preferências | O domínio referencia `user_id` sem depender do Keycloak em cada consulta |
| D11 | Autorização por objeto num único ponto: todo método de repositório de recurso de usuário recebe `OwnerScope` como primeiro parâmetro. Defesa em camadas (ADR 0001 §c): (1) o escopo e o `UserId` só nascem dentro de `@cryptoada/database`, cujo índice público exporta só os tipos e a app os recebe por retorno de função do pacote (`resolveUserBySubject` → `{ userId, scope }`); (2) o lint de `apps/*/src` é lista de bloqueio com as brechas conhecidas fechadas por sonda (Drizzle, `Bun.SQL` em todas as formas, `import()` dinâmico no backend, subcaminhos, asserção, *type guard* e sobrecarga que devolve `UserId`/`OwnerScope`/`AccountId`); (3) contrato negativo por rota | Chamar repositório sem escopo de dono não compila e a app não recebe o escopo por nenhum caminho que o pacote não tenha emitido; as camadas se cobrem entre si e a lista de brechas conhecidas está no ADR, sem afirmar impossibilidade absoluta |
| D13 | `ENV=production` exige configuração explícita (ADR 0001 §g e §p): `TRUSTED_PROXY_HOPS` sem default (1 ou mais atrás de proxy), todas as URLs `https://`, `DATABASE_URL` com `sslmode=require`, segredos de 32+ caracteres e nenhum valor `_dev_only`/`_test_only`; vale para API e cron e a falha de boot não ecoa valores | Um default seguro em dev vira IP errado no rate limit e TLS desligado em produção sem que nada falhe |
| D12 | Worker avalia todas as simulações ativas do par no mesmo candle e roteia alertas pelo dono | Um stream de mercado para todos (RNF06) |

## 3. Modelo de dados

| Tabela | Campos principais |
|---|---|
| `candles` | `exchange`, `symbol`, `timeframe`, `open_time` bigint em ms (PK composta, cobre a leitura do mais recente), `close_time`, `open/high/low/close numeric(24,8)`, `volume numeric(32,8)`, `trade_count`, `created_at`; CHECK `close_time > open_time`, `high >= low`, `timeframe in ('15m','1h','4h','1d')`. Candle fechado é imutável (`ON CONFLICT DO NOTHING`); candle aberto (`close_time >= agora`) é rejeitado pelo repositório. Leitura por `[from, to)` |
| `sentiment_daily` | `date` PK, `fear_greed smallint` (CHECK 0..100), `classification` varchar nulo, `created_at`; o valor do dia é atualizado (`DO UPDATE`) |
| `users` | `id uuid`, `keycloak_sub varchar(255)` (único), `display_name`, `display_currency`, `timezone`, `telegram_chat_id` (nulo até vincular; único quando preenchido), `alert_telegram_enabled`, `limits jsonb`, `created_at`, `updated_at`, `blocked_at`, `deleted_at`, `identity_deleted_at`, `data_purged_at` (ADR 0001 §d, §h) |
| `telegram_link_codes` | `id`, `user_id` (único), `code_hash` (único), `expires_at`, `attempts`, `created_at` — vínculo do chat por código de uso único; só o hash é guardado |
| `strategies` | `id uuid`, `user_id`, `name`, `is_example bool`, `created_at` |
| `strategy_versions` | `id uuid`, `user_id`, `strategy_id`, `version int`, `config jsonb` (validado por Zod), `created_at` |
| `runs` | `id uuid`, `strategy_version_id`, `kind varchar` (`backtest`/`walk_forward`/`live_paper`), `symbol`, `timeframe`, `period_start/end`, `initial_balance numeric`, `fee_rate`, `slippage_rate`, `status varchar`, `metrics jsonb`, `last_candle_time` |
| `signals` | `id uuid`, `run_id`, `candle_time`, `action varchar`, `score numeric`, `votes jsonb`, `indicators jsonb`, `reason text` · único (`run_id`, `candle_time`) |
| `orders` | `id uuid`, `run_id`, `signal_id`, `side`, `type`, `price`, `quantity`, `status`, `created_candle_time`, `expires_candle_time` |
| `fills` | `id uuid`, `user_id`, `order_id`, `price`, `quantity`, `fee`, `filled_at` |
| `positions` | `id uuid`, `run_id`, `symbol`, `entry_price`, `quantity`, `stop_price`, `target_price`, `opened_at`, `closed_at`, `exit_reason` |
| `equity_points` | `run_id`, `time`, `equity numeric`, `benchmark numeric` |
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

## 4. Estratégia de exemplo — "Placar clássico"

| Família | Indicador | Voto |
|---|---|---|
| Tendência | EMA 9 × EMA 21 | +1 acima, −1 abaixo |
| Tendência | MACD (12, 26, 9) | +1 MACD > sinal, −1 abaixo |
| Reversão | RSI 14 | +1 < 30, −1 > 70, 0 entre |
| Volume | OBV vs. sua EMA 20 | +1 subindo, −1 caindo |

Regime: ADX 14 ≥ 25 → tendência (peso 1,5 em tendência, 0,5 em reversão); < 25 → lateral (inverso).
Limiar: compra ≥ +2, venda ≤ −2. Risco: stop 2×ATR, alvo 3×ATR, 1% por operação.

## 5. Walk-forward

- Janelas: ajuste 6 meses, teste 2 meses, passo 2 meses.
- Objetivo da busca: Sharpe fora de taxa e slippage, com mínimo de 10 operações na janela.
- **Alerta de overfitting**: Sharpe fora da amostra < 50% do de dentro, ou fora da amostra negativo
  com dentro positivo.
- Taxa de acerto exibida nos alertas = acerto fora da amostra do último walk-forward da versão.

## 5b. Metas (RF13)

- `evaluateGoal` no `strategy-engine`: para cada (estratégia, par), roda janelas de `prazo` dias
  com passo de 2 dias sobre 2 anos, com saída forçada no alvo e na perda máxima. Puro e
  determinístico; mesmo motor do backtest.
- Custo: 5 pares × 4 estratégias × ~335 janelas × 30 dias ≈ 200 mil passos — roda no `worker_thread`
  da API em menos de 1 s; resultado guardado em cache por (versão da estratégia, par, timeframe,
  meta, dia do último candle).
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
| `trading-signals` não ter algum indicador | T2.2 confere; o que faltar é implementado com teste de referência |
| WebSocket da Binance cair | Reconexão com backoff e backfill da lacuna pelo REST |
| Um usuário ver dado de outro | D11 (filtro obrigatório no tipo) + contrato negativo por rota |
| Walk-forward de um usuário travar os outros | Fila de jobs com teto por usuário (RF00b) |
