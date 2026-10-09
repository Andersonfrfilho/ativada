# Plano — Spec 002

## 1. Arquitetura

```
worker-crypto (sinal no candle fechado)
        │  NOTIFY signal_created
        ▼
apps/executor-crypto ──► RiskGuard (tetos) ──► OrderService ──► ExchangeGateway (CCXT)
        │                                          │                    │
        │                                 clientOrderId idempotente     ▼
        │                                                         Binance testnet / real
        ├──► Reconciler (periódico)
        ├──► ShadowRunner (paper em paralelo)
        └──► Telegram (alertas + /stop)
```

`executor-crypto` é um processo próprio (RNF05). Ele não decide sinal: consome os sinais da spec 001
e só decide **se e como** executar.

## 2. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | CCXT atrás da porta `ExchangeGateway` | Troca de corretora por configuração; testes com dublê |
| D2 | Compatibilidade CCXT × Bun confirmada em spike (T0.1) antes de qualquer outra task | CCXT é pensado para Node; risco de incompatibilidade |
| D3 | Restrições da chave pelo endpoint de restrições da Binance; na testnet, confirmar no spike se existe e, se não, registrar a limitação | RF03 |
| D4 | Estado de armado só em memória: reiniciar o processo sempre desarma | Falha segura |
| D5 | `clientOrderId = hash(signalId + tentativa lógica)` limitado ao tamanho aceito pela corretora | RF07 |
| D6 | Cotação USDT/BRL do par `USDT/BRL` da própria corretora no instante do preenchimento | RF10 |
| D7 | Credencial por usuário cifrada com AES-256-GCM (`crypto.subtle`), chave de aplicação em env, versionada para rotação | RF03; a chave do banco não abre a credencial |
| D8 | Executor processa usuários isolados: um `ExecutionSession` por usuário armado, erro de um não derruba os outros | RNF06 |
| D9 | IP de saída fixo do executor (exigido para restrição de IP da chave) | RF03 — requisito de infraestrutura no deploy |

## 3. Modelo de dados (adições)

| Tabela | Campos principais |
|---|---|
| `exchange_credentials` | `id uuid`, `user_id`, `exchange`, `environment` (`testnet`/`live`), `ciphertext`, `iv`, `key_version`, `last4`, `can_withdraw bool`, `ip_restricted bool`, `checked_at`, `revoked_at` |
| `execution_sessions` | `id uuid`, `user_id`, `mode varchar`, `armed_at`, `disarmed_at`, `disarm_reason`, `limits jsonb`, `armed_by` |
| `exchange_orders` | `id uuid`, `user_id`, `session_id`, `signal_id` (único), `client_order_id` (único), `exchange_order_id`, `side`, `price`, `quantity`, `status`, `sent_at`, `raw_response jsonb` |
| `exchange_fills` | `id uuid`, `exchange_order_id`, `price`, `quantity`, `fee`, `fee_asset`, `usdt_brl numeric`, `value_brl numeric`, `filled_at` |
| `reconciliations` | `id uuid`, `session_id`, `checked_at`, `diff jsonb`, `status` |
| `audit_events` | `id uuid`, `actor`, `action`, `target`, `origin_ip`, `payload jsonb`, `created_at` |

## 4. API de execução

| Método | Rota | Uso |
|---|---|---|
| `PUT/DELETE` | `/v1/me/exchange-credentials/:exchange` | Cadastrar/remover chave (reautenticação + TOTP; nunca devolve o segredo) |
| `POST` | `/v1/admin/execution/kill-all` | Kill switch global (papel `admin`) |
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
