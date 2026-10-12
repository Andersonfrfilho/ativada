# Plano — Spec 002

## 1. Arquitetura

```
worker-ativada (candle fechado gravado)
        │  NOTIFY candle_closed
        ▼
apps/executor-crypto ──► step do strategy-engine (instância do usuário)
        │                    │ ordens do motor (run_id + engine_key)
        │                    ▼
        │              RiskGuard (tetos) ──► OrderService ──► ExchangeGateway (CCXT)
        │                                          │                    │
        │                                 clientOrderId idempotente     ▼
        │                                                         Binance testnet / real
        ├──► Reconciler (periódico)
        ├──► ShadowRunner (paper em paralelo)
        └──► Telegram (alertas + /stop)
```

`executor-crypto` é um processo próprio (RNF05). Ele **roda a sua instância do MESMO `step`** do
`strategy-engine` (ADR 0002 §h), por usuário armado, alimentada por candles fechados + sentimento
(`sentiment_observations`) + comandos (`run_commands`, inclusive o fechamento por kill switch) +
**relatórios da corretora** (`execution_reports`: preenchimento, rejeição, posição fechada
externamente), todos persistidos como fatos de entrada do passo. Assim a decisão é o mesmo código da
simulação (constituição §5), a réplica reproduz o passo a partir do que foi gravado e o sentimento usado
é imutável. O executor não "consome sinais" de outra execução: ele decide **se e como** enviar as ordens
que o seu próprio motor produziu (RiskGuard, tolerância, ordem limitada). O kill switch age **fora** do
motor (cancela na corretora e desarma); o motor fica sabendo pelo relatório de posição fechada
externamente. Adotar uma posição já aberta numa execução nova é decisão desta spec.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | CCXT atrás da porta `ExchangeGateway` | Troca de corretora por configuração; testes com dublê |
| D2 | Compatibilidade CCXT × Bun confirmada em spike (T0.1) antes de qualquer outra task | CCXT é pensado para Node; risco de incompatibilidade |
| D3 | Restrições da chave pelo endpoint de restrições da Binance; na testnet, confirmar no spike se existe e, se não, registrar a limitação | RF03 |
| D4 | Estado de armado só em memória: reiniciar o processo sempre desarma | Falha segura |
| D5 | `clientOrderId = hash(run_id + engine_key + tentativa lógica)` limitado ao tamanho aceito pela corretora; `engine_key` é a chave determinística da ordem do motor (`order-N`) | RF07: a mesma ordem do motor, refeita depois de queda, gera o mesmo id |
| D6 | Cotação USDT/BRL do par `USDT/BRL` da própria corretora no instante do preenchimento | RF10 |
| D7 | Credencial por usuário cifrada com AES-256-GCM (`crypto.subtle`), chave de aplicação em env, versionada para rotação | RF03; a chave do banco não abre a credencial |
| D8 | Executor processa usuários isolados: um `ExecutionSession` por usuário armado, erro de um não derruba os outros | RNF06 |
| D9 | IP de saída fixo do executor (exigido para restrição de IP da chave) | RF03 — requisito de infraestrutura no deploy |

## 3. Modelo de dados (adições)

| Tabela | Campos principais |
|---|---|
| `exchange_credentials` | `id uuid`, `user_id`, `exchange`, `environment` (`testnet`/`live`), `ciphertext`, `iv`, `key_version`, `last4`, `can_withdraw bool`, `ip_restricted bool`, `checked_at`, `revoked_at` |
| `execution_sessions` | `id uuid`, `user_id`, `mode varchar`, `armed_at`, `disarmed_at`, `disarm_reason`, `limits jsonb`, `armed_by` |
| `exchange_orders` | `id uuid`, `user_id`, `session_id`, `run_id`, `engine_key` (único com `run_id`: a ordem do motor que esta ordem executa), `client_order_id` (único, derivado de `run_id + engine_key`), `exchange_order_id`, `side`, `price`, `quantity`, `status`, `sent_at`, `raw_response jsonb` |
| `execution_reports` | `id uuid`, `user_id`, `run_id`, `report_id` (único com `run_id`), `kind` (`fill`/`order_rejected`/`position_closed_externally`), `payload jsonb` (preço, quantidade, taxa, chave da ordem ou da posição), `reported_at`, `candle_time` (passo que o consumiu) — fato da corretora persistido como entrada do `step` (ADR 0002 §h) |
| `exchange_fills` | `id uuid`, `user_id`, `exchange_order_id`, `price`, `quantity`, `fee`, `fee_asset`, `usdt_brl numeric`, `value_brl numeric`, `filled_at` |
| `reconciliations` | `id uuid`, `user_id`, `session_id`, `checked_at`, `diff jsonb`, `status` |

Todas as tabelas acima são de dono: `user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT`,
entram em `OWNED_TABLES` (ADR 0001 §h) e na exclusão de conta. Filhas referenciam o pai por FK composta
`(parent_id, user_id) → parent(id, user_id)`: `exchange_orders.session_id` → `execution_sessions`,
`exchange_fills.exchange_order_id` → `exchange_orders` e `reconciliations.session_id` →
`execution_sessions`, cada pai com `UNIQUE (id, user_id)`.

A trilha de auditoria usa a tabela `audit_events` da spec 001, com o esquema único do ADR 0001 §i
(`actor_user_id` nulo, `actor_kind`, `target_kind`, `target_id`, `action`, `ip` com retenção de 90 dias,
`payload` sem PII). Esta spec não a redefine; só acrescenta valores de `action` e `target_kind`.

## 4. API de execução

| Método | Rota | Uso |
|---|---|---|
| `PUT/DELETE` | `/v1/me/exchange-credentials/:exchange` | Cadastrar/remover chave (`acr = 2` e `auth_time ≤ 5 min`; nunca devolve o segredo) |
| `POST` | `/v1/admin/execution/kill-all` | Kill switch global (papel `admin`, `acr ≥ 2`): só grava o sinal global e audita; resposta agregada (ADR 0001 §j) |
| `GET` | `/v1/execution/status` | Modo, armado, tetos, consumo do dia — do usuário do token |
| `POST` | `/v1/execution/arm` | Arma (exige confirmação digitada) |
| `POST` | `/v1/execution/disarm` | Desarma sem cancelar ordens |
| `POST` | `/v1/execution/kill` | Cancela tudo e desarma |
| `PUT` | `/v1/execution/limits` | Altera tetos (auditado) |
| `GET` | `/v1/execution/shadow-report?date` | Relatório da sombra |
| `GET` | `/v1/execution/fiscal.csv?month` | Registro fiscal |

## 5. Testes

- Dublê de `ExchangeGateway` com falhas injetáveis: timeout após envio, resposta duplicada,
  rejeição por filtro do par, saldo insuficiente.
- Contrato por teto do RF04, provado por mutação (remover a checagem faz o teste falhar).
- Integração contra a testnet da Binance, opt-in por variável, fora do `make check` padrão.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| CCXT incompatível com Bun | Spike T0.1; plano B: cliente REST próprio só para os 6 endpoints usados |
| Testnet diferente da real (liquidez, endpoints) | Sombra em real desarmado antes de operar |
| Chave vazada | Sem saque + IP restrito, verificados no boot |
| Defeito abrir ordens em sequência | Teto de ordens por dia + idempotência + kill switch |
| Real muito pior que a simulação | Relatório da sombra; aumento de teto só com diferença dentro da tolerância |

## Pré-requisitos vindos do contrato do motor (ADR 0002, recheca do arquiteto)

Antes de iniciar esta spec: (1) a quantidade da ordem precisa existir NO ENVIO e o motor só a calcula no preenchimento; o executor dimensiona com a MESMA função pura de tamanho exportada pelo `strategy-engine` (T2.4), usando como P o preço-teto da limitada enviada; sem isso, sombra e real divergem por construção; (2) conciliar o RF06 ("só ordem limitada; mercado só no stop") com as ordens a mercado que o motor cria (entrada do Placar clássico, venda por SELL ou `exit_position`).
