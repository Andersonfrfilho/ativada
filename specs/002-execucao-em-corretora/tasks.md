# Tasks — Spec 002

**Pré-requisito:** spec 001 fechada e gate T6.4 registrado pelo operador.

Cada task fecha com: `bun run typecheck` + testes + commit isolado + evidência em `evidence.md`.

## Fase 0 — Spike

> 🤖 Modelo: `sonnet` (T0.2 é 🧠 — `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T0.1 | Spike CCXT × Bun contra a testnet da Binance: saldo, ordem limitada, cancelamento, consulta por `clientOrderId`, restrições da chave | Relatório em `evidence.md` com o que funciona e o que não |
| T0.2 🧠 | ADR com a decisão do gateway (CCXT ou cliente próprio) e do modelo de idempotência | ADR aprovado pelo operador |

## Fase 1 — Gateway e modos

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | Porta `ExchangeGateway` + dublê com falhas injetáveis | Contrato do dublê |
| T1.2 | Implementação Binance (testnet e real por config) | Integração opt-in na testnet |
| T1.3 | Modos e armar/desarmar (D4: reiniciar desarma) | Contrato: `live` sem as três condições do RF02 não arma |
| T1.4 | Verificação de restrições da chave ao cadastrar e ao armar | Contrato: chave com saque → recusada |
| T1.5 | Credenciais por usuário cifradas (D7), só escrita, com reautenticação + TOTP e auditoria | Contrato: nenhuma rota devolve o segredo; banco guarda só cifrado; B não lê nem remove a chave de A |
| T1.6 | Sessões de execução isoladas por usuário (D8) | Integração: chave revogada de A não interrompe B |

## Fase 2 — Travas

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | `RiskGuard` com os cinco tetos do RF04 | Um teste por teto, provado por mutação |
| T2.2 | Filtros do par (incremento, mínimo) | Contrato com filtros reais gravados |
| T2.3 | Kill switch do usuário (API e Telegram do chat vinculado) e global do admin | Testnet: cancela em < 5 s; kill de A não toca B; global desarma todos |

## Fase 3 — Idempotência e reconciliação

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | Migrations da §3 do plano | `make migration-test` |
| T3.2 | `OrderService` com `clientOrderId` determinístico e consulta antes de reenvio | Falha injetada após envio → zero duplicadas |
| T3.3 | Reconciliador periódico e no boot | Divergência simulada → desarma e alerta |
| T3.4 | Trilha de auditoria | Contrato: cada ação do RF11 grava evento |

## Fase 4 — Sombra e registro fiscal

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | `ShadowRunner` e relatório diário | Contrato com execução real simulada |
| T4.2 | Registro fiscal com cotação USDT/BRL e CSV mensal | Contrato: colunas, decimais, valor em R$ |

## Fase 5 — Painel de execução

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | Tela de execução: modo, armado, tetos e consumo do dia, botão de emergência sempre visível | E2E |
| T5.2 | Relatório da sombra e exportação fiscal | E2E |
| T5.3 | Revisão de design e usabilidade, celular e desktop | Prints em `evidence.md` |
| T5.4 | Auditoria de segurança (constituição §7, segredos, logs) | Checklist em `evidence.md` |

## Fase 6 — Subida (somente operador)

> 🛑 Sem I.A. executando. A I.A. pode preparar relatórios a partir do registro.

| Task | O quê | Quem |
|---|---|---|
| T6.0 | Pendência regulatória da spec validada por advogado (bloqueia T6.2 em diante para qualquer usuário além do responsável) | Responsável pelo produto |
| T6.1 | Testnet por 7 dias | Operador liga; I.A. analisa os registros |
| T6.2 | Sombra em real desarmado por 7 dias | Operador cria a chave real e configura |
| T6.3 | Real pequeno por 30 dias | Operador arma o `live` |
| T6.4 | Revisão de tetos com base na sombra | Operador decide |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/002-execucao-em-corretora/ do repositório
~/Documents/personal/cryptoada (leia CLAUDE.md, docs/spec/constitution.md, spec.md,
plan.md e tasks.md antes de começar). Só comece se specs/001-simulador-e-sinais/evidence.md tiver a
decisão humana da T6.4. Uma task por vez, na ordem do tasks.md, da Fase 0 à Fase 5.
Modelos: todas as fases → executor model=sonnet · T0.2 🧠 → opus (validar com architect) ·
revisão final → code-reviewer model=sonnet e security-reviewer.
Escalada: gate falhou 2x → sobe um nível e registra em evidence.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: aprovar o ADR da T0.2, migration destrutiva, dependência nova,
qualquer [NEEDS CLARIFICATION]. Use só a testnet da Binance.
Nunca execute a Fase 6, nunca crie ou use chave real, nunca arme o modo live, nunca envie ordem
com dinheiro real.
```
