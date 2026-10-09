# Plano — Spec 001

## 1. Arquitetura

```
                 Binance REST (histórico)          Binance WS (kline ao vivo)
                          │                                   │
                   cron-crypto (backfill)              worker-crypto
                          │                       ┌──────────┴──────────┐
                          ▼                       │ candle fechado      │
                     PostgreSQL ◄──────────────── │ → strategy-engine   │
                          │   LISTEN/NOTIFY       │ → corretora simulada│
                          ▼                       └──────────┬──────────┘
                    api-crypto ── WebSocket ──► frontend-crypto   Telegram ◄─┘
                    (backtest em worker_thread)
```

| Peça | Papel |
|---|---|
| `packages/strategy-engine` | Puro, sem I/O: indicadores, votos, regime, risco, corretora simulada, métricas, walk-forward |
| `packages/database` | Drizzle (driver `Bun.sql`), schema, migrations com `rollback.sql` obrigatório, cliente; usado por API, worker e cron |
| `packages/environment` | Validação Zod do ambiente (`parseEnvironment`, `runWithEnvironment`, `postgresUrlSchema`); lista todas as variáveis inválidas e nunca imprime valores |
| `apps/cron-crypto` | One-shot agendado: backfill de candles, correção de lacunas, Fear & Greed |
| `apps/worker-crypto` | Consome o stream de klines; no candle fechado, avalia as simulações ativas, grava e notifica |
| `apps/api-crypto` | `Bun.serve`: REST, WebSocket para o painel, backtest e walk-forward em `worker_thread` |
| `apps/frontend-crypto` | React 19 + Vite, PWA |

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
| D5 | Sem fila externa na etapa 1: o stream da Binance é a entrada do worker; worker→API por `LISTEN/NOTIFY` | Um usuário, local; RabbitMQ seria peso sem ganho |
| D6 | Execução em `t+1` na abertura; stop antes do alvo no mesmo candle | Constituição §3 e §4 |
| D7 | Saldo em USDT; exibição em R$ pela cotação USDT/BRL do momento | Pares cotados em USDT têm mais liquidez e histórico |
| D8 | Telegram por Bot API direta (`fetch`), sem SDK | Dois métodos usados; dependência não se paga |
| D9 | Keycloak (OIDC) para login, com realm versionado em `realm/`; a API valida o JWT pela JWKS | Senha, recuperação, verificação de e-mail e TOTP prontos; mesma pilha já usada no ecossistema |
| D10 | Tabela `users` local espelha o `sub` do Keycloak (criada no primeiro acesso) e guarda preferências | O domínio referencia `user_id` sem depender do Keycloak em cada consulta |
| D11 | Autorização por objeto num único ponto: todo repositório de recurso de usuário recebe `userId` obrigatório no tipo | Esquecer o filtro vira erro de compilação, não vazamento |
| D12 | Worker avalia todas as simulações ativas do par no mesmo candle e roteia alertas pelo dono | Um stream de mercado para todos (RNF06) |

## 3. Modelo de dados

| Tabela | Campos principais |
|---|---|
| `candles` | `exchange`, `symbol`, `timeframe`, `open_time` (PK composta), `open/high/low/close/volume numeric` |
| `sentiment_daily` | `date` PK, `fear_greed smallint` |
| `users` | `id uuid`, `keycloak_sub` (único), `display_name`, `display_currency`, `timezone`, `telegram_chat_id` (nulo até vincular), `limits jsonb`, `created_at`, `deleted_at` |
| `telegram_link_codes` | `code` (hash), `user_id`, `expires_at` — vínculo do chat por código de uso único |
| `strategies` | `id uuid`, `user_id`, `name`, `is_example bool`, `created_at` |
| `strategy_versions` | `id uuid`, `strategy_id`, `version int`, `config jsonb` (validado por Zod), `created_at` |
| `runs` | `id uuid`, `strategy_version_id`, `kind varchar` (`backtest`/`walk_forward`/`live_paper`), `symbol`, `timeframe`, `period_start/end`, `initial_balance numeric`, `fee_rate`, `slippage_rate`, `status varchar`, `metrics jsonb`, `last_candle_time` |
| `signals` | `id uuid`, `run_id`, `candle_time`, `action varchar`, `score numeric`, `votes jsonb`, `indicators jsonb`, `reason text` · único (`run_id`, `candle_time`) |
| `orders` | `id uuid`, `run_id`, `signal_id`, `side`, `type`, `price`, `quantity`, `status`, `created_candle_time`, `expires_candle_time` |
| `fills` | `id uuid`, `order_id`, `price`, `quantity`, `fee`, `filled_at` |
| `positions` | `id uuid`, `run_id`, `symbol`, `entry_price`, `quantity`, `stop_price`, `target_price`, `opened_at`, `closed_at`, `exit_reason` |
| `equity_points` | `run_id`, `time`, `equity numeric`, `benchmark numeric` |
| `walk_forward_windows` | `run_id`, `index`, `train_start/end`, `test_start/end`, `best_params jsonb`, `in_sample jsonb`, `out_of_sample jsonb` |
| `alerts` | `id uuid`, `signal_id`, `channel`, `sent_at`, `status` |

`runs`, `signals`, `orders`, `positions`, `equity_points` e `alerts` também levam `user_id`
(denormalizado de propósito: o filtro do dono não depende de join). Índices começam por `user_id`.
`candles` e `sentiment_daily` não têm dono.

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
| `POST` | `/v1/me/telegram-link` | Gera código de vínculo do Telegram |
| `GET` | `/v1/me/export` · `DELETE /v1/me` | LGPD: exportar e apagar a conta |
| `POST` | `/v1/admin/invitations` | Convidar usuário (papel `admin`) |

Toda rota exige Bearer token, exceto o health. O WebSocket autentica no handshake e reautentica
quando o token expira. Recurso de outro usuário responde `404`.

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
