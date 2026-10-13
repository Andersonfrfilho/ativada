# Tasks — Spec 006

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script `test` do
`package.json` do painel.

## Fase 0 — Contrato

> 🤖 Modelo: `opus` 🧠 (decisão herdada por todas as fases)

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Reproduzir a queda (`docker restart` do Postgres descartável com worker vivo) e registrar o `code`/`errno` real do Bun.SQL e se ele se recupera sozinho; fechar o contrato da reconexão (plan D2), da parada (D3) e o porquê do banco como fila (D4) | Seção "Simulação ao vivo robusta (spec 006)" no ADR 0002 com a lista de códigos de conexão, limiar, backoff, regra de parada, chave do alerta e "sem mensageria nova"; reprodução anotada em `evidence.md` |

## Fase 1 — Reconexão e saúde

> 🤖 Modelo: `sonnet` (T1.1 e T1.2 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `reconnect-backoff.ts` e `outage-log.ts` puros + `readSafeErrorFields` (`name`, `code`, `errno`) | Contas à mão e propriedades (nunca passa do teto; sorteio dentro da faixa; uma linha a cada 60 s); mensagem crua nunca sai |
| T1.2 | `flaky-sql.ts` em `packages/database/test-support/` (cai e volta sob comando) | Contrato do próprio dublê |
| T1.3 | `ResilientDatabase` (classifica erro, `down` após o limiar, reabre o `Bun.SQL` só entre rondas, teto de tempo por consulta); `openDatabase` passa a usá-lo sem mudar a forma do `DatabaseHandle` | Contrato com o dublê: cai → `down` → reabre → `up`; transação em voo nunca é trocada; `make database-test` verde |
| T1.4 | Laços do worker (`live-scheduler`, `alert-scheduler`, `recovery-runner`) esperam o backoff quando `down` e logam pelo `outage-log` com `code` | Contrato: 1.000 rondas com banco fora → ≤ 1 linha por laço a cada 60 s, todas com `code`, nenhuma com URL/senha; volta na ronda seguinte |
| T1.5 | Batimento: migration `0022_worker_heartbeats` (+ `.rollback.sql`), repositório, laço `WORKER_HEARTBEAT_SECONDS`; env validado | `make migration-test` e `make database-test` verdes; rollback testado |
| T1.6 | `/v1/health` com `SELECT 1` (teto 1 s) → `200`/`503`; `/v1/admin/health` com `worker` e `database.lastFailureCode`; OpenAPI | Contratos de rota (`loadApiApp()`) com banco fora e dentro; `api-openapi` verde; nenhum detalhe no público |
| T1.7 | `make db-outage-test` (plan D7) + mutantes `test/db-reconnect-mutants.contract.test.ts` | Volta ≤ 60 s, `fills`/`signals` iguais à execução contínua, log sem PII; mutantes mortos |

## Fase 2 — Aviso de simulação parada

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | `stall-policy.ts` puro (`computeStalledSince`) | Contas à mão em 15m/1h/4h/1d, com e sem passo, com `waitingForData`; propriedades (nunca antes do fim da vela esperada + carência) |
| T2.2 | Migration `0023_run_stall` (`runs.stalled_since`; `alerts_side_check` com `STALL`, `RESUME`) + `.rollback.sql`; `stalledSince` em `GET /v1/runs/:id` e na lista (aditivo) | `make migration-test`; contrato do campo; 404 entre usuários intacto |
| T2.3 | `stall-sweeper.ts` na API (60 s, `pg_try_advisory_xact_lock`, `UPDATE` + `alerts` + `pg_notify` na mesma transação; `RESUME` na volta) | Contrato: episódio gera UM `STALL` e UM `RESUME`; duas instâncias não duplicam; ronda repetida não duplica |
| T2.4 | Texto `STALL`/`RESUME` no despachante do worker (sem PII, respeita o limite diário) | Contrato com a Bot API falsa; `make telegram-test` verde |
| T2.5 | Mutantes `test/live-stall-mutants.contract.test.ts` e o caso de parada no `make db-outage-test` (worker morto 20 min com relógio adiantado) | Mutantes mortos; faixa e alerta no teste de integração |

## Fase 3 — Vela escolhida no painel

> 🤖 Modelo: `sonnet` (T3.1 e T3.4 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `simulation-timeframe.constant.ts` (opções, frases do RF02/RF03, padrão `1h`) e `next-candle-close.ts` puro; `useGoalSimulation.hook.ts` sai do `RankingCard` | Contrato da função (fim da vela em 15m/1h/4h/1d, virada do dia em São Paulo); frases iguais ao spec |
| T3.2 | `SimulationTimeframePicker` no cartão de ranking e na tela da meta: seletor acessível (radio), "Mais opções" com 15m e aviso de taxas, aviso do ranking diário, contagem "N de 5", aviso de duplicata com link, botão desabilitado no limite | Contrato: o `POST /v1/runs` leva o timeframe escolhido; padrão `1h`; teclado e leitor de tela; 409 mostra o texto do RF05 |
| T3.3 | `LiveRunStatus` (aguardando a primeira vela às HH:MM hoje/amanhã, última e próxima decisão, espera por dado, parada) em `BalanceCard`, `ActiveGoalCard` e detalhe; Zod de `stalledSince` | Contrato dos quatro estados com fixture; "Aguardando o primeiro candle" some do código e do `test/goals.contract.tsx` |
| T3.4 | Atualizar o E2E (`make panel-e2e`): simular meta em `1h` e ver o estado "aguardando"; faixa de parada por `pg_notify` do servidor de controle | E2E verde |

## Fase 4 — Scripts e runbook

> 🤖 Modelo: `haiku` (T4.1 → `sonnet`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | `scripts/dev-up.sh`/`.ps1` e `dev-down.sh`/`.ps1` (plan D6); `.dev/` no `.gitignore` | No WSL, do zero: infra, migrations, API, worker e painel no ar; segunda execução não duplica processo; nenhum valor de segredo na saída (grep) |
| T4.2 | `docs/runbook-dev-local.md` (subir, descer, "banco não responde" com `docker ps`/`Test-NetConnection`/`nc -z`, logs novos, admin health) e link em `docs/runbook-live72.md` | Diff revisado; comandos conferidos no WSL |

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | Revisão de design (web.md §15): seletor, avisos e faixa a 375 px nos dois temas, foco visível, nunca só cor; **uma** captura final | Captura em `evidence.md`; divergências corrigidas ou listadas |
| T5.2 | Atualizar `CLAUDE.md` (reconexão, batimento, parada, vela da simulação, `dev-up`, alvos `make` novos) | Diff revisado |
| T5.3 | Revisão final e auditoria §15 do code-standart (logs sem PII, `Promise.all`, I/O assíncrono, sem stack trace no 500, `/v1/health` sem detalhe) | Relatório em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/006-simulacao-ao-vivo-robusta/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: T0.1 🧠 → opus (reproduzir a queda, fechar o contrato e registrar no ADR 0002) ·
Fase 1 → executor model=sonnet (T1.1 e T1.2 → executor model=haiku) · Fase 2 → executor model=sonnet ·
Fase 3 → executor model=sonnet (T3.1 e T3.4 → executor model=haiku) · Fase 4 → executor model=haiku
(T4.1 → executor model=sonnet) · Fase 5 → executor model=sonnet · revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + testes + commit isolado, evidência em evidence.md.
Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
Não mude packages/strategy-engine nem packages/run-recording (spec RNF03). Sem mensageria nova: a fila é o banco (ADR 0002).
Nunca logue mensagem crua de erro de banco, URL, usuário, senha nem dado pessoal: só name, code e errno.
Pare e pergunte antes de: deploy, migration destrutiva, mudar a vela padrão (1h), o teto do backoff (30 s), a carência
de parada (15 min) ou o teto de 5 simulações ao vivo, tornar /v1/health detalhado, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, apagar volumes que não sejam os descartáveis do projeto.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T5.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
