# Tasks — Spec 015

Cada task fecha com: `bun run typecheck` + `bun run lint` + `bun run format:check` + testes + commit isolado
(`git commit -- <caminhos>`) + evidência em `evidence.md`. Rode os gates no Linux/WSL (spec 003, plan D6). Teste novo do
painel entra na lista explícita do script `test` do `package.json` do painel.

**Antes de começar:** confira em `evidence.md` as respostas do usuário às decisões do `spec.md` §9. Sem resposta, valem
os padrões A, **exceto** o que exige autorização:

| O quê | Onde | Exige |
|---|---|---|
| Migration `0027_model_agents` (plan D6) | T2.1 | autorização registrada em `evidence.md` |
| Chaves reais e o teste com o provedor real | T5.2 | o usuário põe a chave no `env.dev.local`; a I.A. nunca lê, escreve nem imprime a chave |
| Governar (plan D9, `analyst-2`) | Fase 6 | autorização + 30 opiniões medidas por agente + contrafactual |

**Dependências:** spec 007 com a sombra e as rotas `/analyst*` prontas, e a spec 011 com a varanda e os ◆ (`BALCONY_MODELS`).
Não mude `packages/strategy-engine`, `packages/run-recording` nem a regra `analyst-1` nesta spec.

## Fase 0 — Conferência e contrato

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T0.1 | Conferir na documentação oficial (WebFetch) as formas que o plan marca **[a conferir]**: o nome do campo de nível de raciocínio no REST v1beta do Gemini, `responseSchema` com o esquema da opinião, `usageMetadata`, o id do Haiku 5.5 e os preços. Conferir o número livre da migration e o nome/colunas de `worker_heartbeats` e `users` | Tabela "fato → fonte (URL) → data" em `evidence.md`; divergência do plan corrigida no plan |
| T0.2 | Adendo "Agentes de modelo (spec 015)" no ADR 0002, copiando as decisões M1… do plan (D2 a D9) e a regra "opinião do modelo é entrada gravada" | Adendo revisado; nenhuma decisão nova fora do plan |

## Fase 1 — Domínio puro (`packages/model-agents`)

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | Pacote novo (workspace, `package.json`, tsconfig, teste de fronteira de pureza), `model-agent-catalog.constant.ts`, `model-opinion.schema.ts`, `prompt-input.schema.ts`, `model-call-result.types.ts` | Bordas do esquema (0/100, 160/161, chave a mais, `userId` recusado); fronteira verde |
| T1.2 | `prompt-template.ts` (`prompt-1`, `renderPrompt`, `hashPrompt`), `reason-hygiene.ts`, `model-agents-messages.ts` (catálogo fechado da tela, RF17/RNF07) | Dourado literal do prompt e do hash; varredura de privacidade (UUID, `@`, chaves); cada palavra proibida trocada; varredura das frases da tela |
| T1.3 | `model-cost.ts`, `budget-policy.ts`, `provider-circuit.ts` | Contas à mão (para cima a 8 casas); bordas exatas do teto; todas as transições do circuito com relógio falso |
| T1.4 | `opinion-auditor.ts` + oráculo `bigint` em `test/fixtures/model-agents/` (sem importar `src`) + ≥ 15 mutantes (`test/model-agents-mutants.contract.test.ts`) | Auditor = oráculo; bordas 29/30, empate, lacuna, `neutral`, `on_demand`; todos os mutantes morrem |

## Fase 2 — Banco, adaptadores e despachante (worker)

> 🤖 Modelo: `sonnet` (T2.1 ⚠ para e pergunta)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 ⚠ | **Parar e perguntar** (migration). Autorizada: `0027_model_agents.sql` + `.rollback.sql` como o plan D6, esquemas Drizzle, `model-opinion.repository.ts` e `user-model-agent.repository.ts` (`OwnerScope`), `ownership-registry`, exportação e purga LGPD de `user_model_agents`, tarefa `expire-model-opinions` no cron | `make migration-test`, `make database-test` (fila, unicidade parcial, somas do dia/mês, arrendamento), `make lgpd-test` |
| T2.2 | Env do worker e da API (plan D8: opcionais, obrigatórios com a chave, `secretVariables`) + `provider-http.ts` + `anthropic-provider.ts` + `gemini-provider.ts` + provedores falsos em `packages/model-agents/test-support/` | Cada código de RF01 contra o falso; `redirect` falha; sentinela `sk-test-SENTINEL` ausente de log, erro e linha; boot sem chave = desligado sem erro; chave sem id/preço = boot falha |
| T2.3 | `opinion-scheduler.ts` (enfileirar na transação do passo, uma chamada em `live-step.ts`), `opinion-dispatcher.ts` (arrendamento, concorrência, pré-checagens do plan D2, teto sob trava, circuito), `provider-status.ts` (batimento, RF22), `create-model-agents-wiring.ts` | Idempotência com 2 simulações no par; **sombra = byte a byte** (`fills`/`signals`/`analyst_decisions` com e sem agentes); p95 do passo ± 2 ms; `STALE`; duas instâncias não passam do teto; falha nunca chega ao passo |
| T2.4 | `make model-agents-test` (Postgres descartável, worker em subprocesso, provedores falsos com latência, 5xx em série, 429 e 401) | Circuito abre e fecha; `BUDGET_EXHAUSTED` no teto; nenhum container vivo depois do alvo |

## Fase 3 — API

> 🤖 Modelo: `sonnet` (T3.3 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `GET /v1/me/model-agents` e `PATCH /v1/me/model-agents/:agentKey` (políticas novas, `access`, `documentation`, Zod) | Contratos: `govern` → `409 MODEL_AGENT_GOVERN_LOCKED`; chave fora do catálogo → `404`; `providerState` do batimento; outro usuário não vê nem muda |
| T3.2 | `GET /v1/runs/:runId/model-agents` (estado, últimas opiniões, placar em SQL + `judgeAgainstCoinFlip`, custos, `comparison` com cursor) e `POST /v1/runs/:runId/model-agents/:agentKey/opinions` (contador diário atômico) | ≤ 4 consultas; o mesmo `404`; `409 RUN_NOT_LIVE`/`ANALYST_NOT_ENABLED`/`MODEL_AGENT_DISABLED`/`MODEL_AGENT_UNAVAILABLE`/`RUN_NOT_RUNNING`; `429`; `400` sem eco; placar = oráculo; p95 ≤ 300 ms |
| T3.3 | Mutantes do filtro de dono (`make api-runs-mutants` +N) e `api-openapi` | Todos os mutantes morrem; documento gerado com as 4 rotas |

## Fase 4 — Painel

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Zod do painel (`*.validation.ts`) espelhando as rotas; `useModelAgentsQuery` (chave `['runs', runId, 'model-agents']`, polling de 2 s só com `pending`) | Contratos com `fake-fetch`; nenhum `Number(` em dinheiro (custo em `BigInt` escala 8) |
| T4.2 | ◆ vivos na varanda e no escritório: estado (ícone + palavra + cor), balão com motivo e rodapé "gerado por modelo", ficha (RF17), sem "em breve" quando pronto | Texto literal de cada estado (`no_key`, teto, circuito, chave recusada, modelo indisponível, pensando, desligado); ◆ distinguível sem cor; 44 px; 375 px; contraste `--model` |
| T4.3 | Botão "Pedir opinião agora" (RF18) e o cartão "Modelos × regras" (RF19) | Botão desabilitado com a frase do motivo; avulso marcado e fora do placar; ✓/✗ certos; "ainda aberta"; frase fixa da comparação |
| T4.4 | Preferências (Conta): interruptor por agente, "Modo" com governar desabilitado e a frase; glossário (RF21) | Contratos; foco e teclado; palavras proibidas varridas |

## Fase 5 — Prova de ponta a ponta e fechamento

> 🤖 Modelo: `sonnet` (T5.4 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | E2E (`make panel-e2e`, Edge): servidor de controle grava uma opinião `decided` (e `pending` → `decided`) + aviso; a sala mostra sem recarregar; preferências ligam/desligam | E2E verde, zero violação de CSP |
| T5.2 ⚠ | **Teste real, manual, com o usuário.** Ele põe as chaves no `envs/env.dev.local` (a I.A. nunca abre esse arquivo) e liga um agente de cada provedor; um "Pedir opinião agora" por provedor | Tokens, custo, latência e postura de cada um em `evidence.md`; varredura dos logs sem a chave; se o usuário não tiver chave, registrar "pendente" e seguir |
| T5.3 | Revisão de design a 375 e 1280 px nos dois temas; **uma** captura final por tema | Capturas em `evidence.md` |
| T5.4 | `CLAUDE.md` (pacote `model-agents`, env, rotas, alvo `make model-agents-test`) | Diff revisado |

## Fase 6 — Governar (SÓ DESENHO; não executar sem autorização)

> 🤖 Modelo: 🧠 `opus` (desenho e revisão do arquiteto) → `sonnet` (execução)

| Task | O quê | Aceite |
|---|---|---|
| T6.0 🧠 | **Parar e perguntar.** Só com a autorização registrada e ≥ 30 opiniões contadas por agente: `analyst-2` (o ◆ como especialista com peso A7), espera até o prazo, voto gravado em `analyst_decisions`, migration dos `CHECK` | Revisão do arquiteto no ADR; contrafactual sem/com modelo gravado em `evidence.md` antes de qualquer código |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/015-agentes-de-modelo/ (leia spec.md, plan.md e tasks.md antes de
começar; contexto em specs/007-analista-de-risco-senior/, specs/011-sala-da-equipe/escritorio.md e no ADR 0002 §"Analista
de risco (spec 007)"). Uma task por vez, na ordem do tasks.md, das Fases 0 a 5. A Fase 6 NÃO é executada.
ANTES DE TUDO: confira em specs/015-agentes-de-modelo/evidence.md as respostas do usuário ao spec.md §9. Sem resposta,
padrões A, MAS a migration 0027 (T2.1) só com autorização registrada: sem ela, PARE e pergunte.
Modelos: Fase 0 → executor model=sonnet · Fase 1 → executor model=sonnet (T1.1 → executor model=haiku) · Fase 2 →
executor model=sonnet · Fase 3 → executor model=sonnet (T3.3 → executor model=haiku) · Fase 4 → executor model=sonnet ·
Fase 5 → executor model=sonnet (T5.4 → executor model=haiku) · revisão final → code-reviewer model=sonnet e
security-reviewer model=sonnet (chaves, privacidade do prompt, higiene do texto do modelo).
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado
(git commit -- <caminhos>), evidência em evidence.md. Rode os gates no Linux/WSL.
Regras: MODO SOMBRA sempre (a opinião do modelo nunca entra no motor, no advanceCandle, em analyst_decisions nem na
regra analyst-1; prova byte a byte obrigatória). O passo ao vivo só enfileira; falha de provedor nunca derruba nada.
Chave só no worker, nunca em log/erro/linha/resposta/batimento/commit/terminal; a I.A. nunca lê, escreve nem imprime
envs/env.dev.local nem chave real. Ids de modelo e preços só por env (sem padrão no código). Só dado público de mercado
no prompt (strictObject), nada do usuário. Sem SDK e sem dependência nova (fetch + Zod). Teto de custo com reserva
antes de chamar. Toda fala de interface sem "vai subir", "garantido", "recomendamos", "compre", "venda", "confiante".
Tudo simulado: nenhuma ordem real, nenhuma chave de corretora, nada de modo live.
Não mude packages/strategy-engine, packages/run-recording nem a regra analyst-1.
Pare e pergunte antes de: a migration 0027, deploy, qualquer chamada a provedor REAL (só a T5.2, com o usuário), mudar
o motor/run-recording/analyst-1, dependência nova, a Fase 6, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, mexer nos containers ativada-dev-*.
UI: verifique por texto (read_page, get_page_text); screenshot só na T5.3.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
