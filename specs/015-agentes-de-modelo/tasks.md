# Tasks — Spec 015 (revisão 2: equipes de modelo)

Cada task fecha com: `bun run typecheck` + `bun run lint` + `bun run format:check` + testes + commit isolado
(`git commit -- <caminhos>`) + evidência em `evidence.md`. Rode os gates no Linux/WSL (spec 003, plan D6 da spec 003). Teste
novo do painel entra na lista explícita do script `test` do `package.json` do painel.

**Antes de começar:** confira em `evidence.md` as respostas do usuário às decisões do `spec.md` §9. Sem resposta, valem os
padrões A, **exceto** o que exige autorização:

| O quê | Onde | Exige |
|---|---|---|
| Migration `0027_model_teams` (plan D6) | T2.1 | autorização registrada em `evidence.md` |
| Mudança de API e de worker para a execução de equipe e o duelo (plan D9) | Fase 3 e 4 | autorização registrada em `evidence.md` |
| Chaves reais e o teste com o provedor real | T6.2 | o usuário põe a chave no `env.dev.local`; a I.A. nunca lê, escreve nem imprime a chave |
| Níveis do modelo comandando a ordem (opção B, mudança de motor) | Fase 7 | autorização separada + ADR |

**Dependências:** spec 007 com a sombra e as rotas `/analyst*` prontas, spec 011 com a varanda e os ◆ (`BALCONY_MODELS`) e spec
017 com o gráfico em velas menores. **Não mude `packages/strategy-engine`, `packages/run-recording` (salvo o export ADITIVO
da T3.1, com autorização) nem a regra `analyst-1`.**

## Estado herdado da revisão 1 (o que já existe e o que fazer com isso)

| Já feito | Commit | Situação na revisão 2 |
|---|---|---|
| T0.1 conferência das documentações (Gemini, Claude) | `6dd45ff` | vale; **falta** registrar os fatos da OpenAI (T0.1b) |
| T0.2 adendo ao ADR 0002 (M1 a M11, agentes de opinião) | `6dd45ff` | **superado**: reescrever para equipes (T0.2b) |
| T1.1 pacote `@ativada/model-agents`, catálogo, esquemas | `184a6de` | **retrabalhar** (T1.1b): equipes `nina/lucas/olivia`, provedor `openai`, esquema do relatório da equipe |
| T1.2 prompt, higiene, frases | `a11fd1a` | **retrabalhar** (T1.2b): `team-prompt-1`, três textos, frases de equipe |
| T1.3 custo, teto, circuito (código e testes, SEM commit) | — | **reaproveitável quase inteiro** (T1.3b): troca de nomes e a reserva de saída maior |

## Fase 0 — Conferência e contrato

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T0.1b | Registrar em `evidence.md` os fatos da OpenAI conferidos em 2026-10-17 (Responses API, `text.format` com `json_schema` estrito, `reasoning.effort`, `reasoning_tokens`, `max_output_tokens` com raciocínio, recusa, ids e preços) e o fato novo do motor (stop e alvo vêm da configuração de risco, não do sinal) | Tabela "fato → fonte (URL) → data" |
| T0.2b | Reescrever o adendo "Agentes de modelo (spec 015)" do ADR 0002 como **"Equipes de modelo (spec 015)"**: decisão gravada como entrada, execução em `t + 1`, as DT1 a DT12 e a tabela "o que cada parte exige" do plan D9 | Adendo revisado; nenhuma decisão fora do plan; `architect` (opus) valida o D9 antes da Fase 3 |

## Fase 1 — Domínio puro (`packages/model-agents`)

> 🤖 Modelo: `sonnet` (T1.1b e T1.3b → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1b | Catálogo das 3 equipes (`nina` Google, `lucas` Anthropic, `olivia` OpenAI; papéis `trend`, `risk`, `decision`), `team-report.schema.ts` (RF07), `team-levels.ts` (coerência `stop < entrada < alvo`, tolerância da entrada, distância mínima da proteção), `team-prompt-input.schema.ts`, `model-call-result.types.ts` com `team` no lugar de `agent` | Bordas do esquema (0/100, 160/161, chave a mais, `userId` recusado); preço nulo em `sell`/`hold` e obrigatório em `buy`; fronteira verde |
| T1.2b | `prompt-template.ts` (`team-prompt-1`), `reason-hygiene.ts` nos três textos, `prompt-privacy.ts`, `model-agents-messages.ts` com a frase da equipe e "nuvem da OpenAI" | Dourado literal do prompt e do hash; varredura de privacidade; cada palavra proibida trocada; varredura das frases da tela |
| T1.3b | `model-cost.ts`, `budget-policy.ts`, `provider-circuit.ts` (já escritos; ajustar nomes e o teto de raciocínio por equipe) | Contas à mão com a saída maior; bordas exatas do teto; todas as transições do circuito; conta da spec §8 batendo |
| T1.4 | `team-signal.ts`: `toTeamSignal` (matriz de tradução do plan D9: buy/sell/hold × com/sem posição → `BUY/SELL/HOLD` com `score`, `reason`, `votes: []`) como função **pura** que devolve um objeto de sinal tipado no pacote (sem importar o motor), mais o auditor de acertos | Matriz completa testada; determinismo; sem lookahead (o sinal de `t` só depende da linha e do fechamento de `t`); ignoradas gravam o motivo |
| T1.5 | `opinion-auditor.ts` (acerto de lado de `buy`/`sell`, Wilson de `@ativada/statistics`) + oráculo `bigint` em `test/fixtures/model-agents/` (sem importar `src`) + ≥ 15 mutantes (`test/model-agents-mutants.contract.test.ts`) | Auditor = oráculo; bordas 29/30, empate, lacuna, `hold`, `on_demand`; todos os mutantes morrem |

## Fase 2 — Banco, adaptadores e despachante (worker) — exige autorização do plan D6

> 🤖 Modelo: `sonnet` (T2.1 ⚠ para e pergunta)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 ⚠ | **Parar e perguntar** (migration). Autorizada: `0027_model_teams.sql` + `.rollback.sql` como o plan D6, esquemas Drizzle, `team-report.repository.ts` e `user-model-team.repository.ts` (`OwnerScope`), `ownership-registry`, exportação e purga LGPD de `user_model_teams`, tarefa `expire-model-team-reports` no cron | `make migration-test`, `make database-test` (fila, unicidade parcial, somas do dia/mês, arrendamento), `make lgpd-test` |
| T2.2 | Env do worker e da API (plan D8: opcionais, obrigatórios com a chave, `secretVariables`) + `provider-http.ts` + `anthropic-provider.ts` + `gemini-provider.ts` + **`openai-provider.ts`** (Responses API, `json_schema` estrito, recusa, `incomplete`) + provedores falsos dos três em `packages/model-agents/test-support/` | Cada código de RF01 contra cada falso; `redirect` falha; sentinela `sk-test-SENTINEL` ausente de log, erro e linha **nos três adaptadores**; boot sem chave = desligado sem erro; chave sem id/preço = boot falha; `OPENAI_API_KEY` em `secretVariables` |
| T2.3 | `report-scheduler.ts` (enfileirar na transação do passo, uma chamada em `live-step.ts`), `report-dispatcher.ts` (arrendamento, concorrência, pré-checagens do plan D2, teto sob trava, circuito), `provider-status.ts` (batimento), `create-model-teams-wiring.ts` | Idempotência com 2 execuções no par; **execuções de regra byte a byte iguais** com e sem equipes; p95 do passo ± 2 ms; `STALE`; duas instâncias não passam do teto; falha nunca chega ao passo |
| T2.4 | `make model-teams-test` (Postgres descartável, worker em subprocesso, provedores falsos com latência, 5xx em série, 429 e 401) | Circuito abre e fecha; `BUDGET_EXHAUSTED` no teto; nenhum container vivo depois do alvo |

## Fase 3 — A equipe na simulação (worker) — exige autorização do plan D9

> 🤖 Modelo: `sonnet` (T3.1 → 🧠 `opus` valida o desenho antes)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 🧠⚠ | **Prova de viabilidade do plan D9, antes de tudo.** Num teste (sem tocar o motor): montar a `StrategyVersion` `model-team-1`, entregar um `SignalDecision` sintético (`votes: []`, `configHash` da estratégia) ao `walletStep` avulso e conferir que a guarda aceita e que `BUY` abre posição na abertura de `t + 1` com o stop e o alvo da configuração de risco. Se a guarda recusar: **parar e propor o ajuste aditivo** (export de mapeamento no `run-recording`, ou relaxar `votes` vazio) à autorização | Teste verde ou relatório do ajuste mínimo; `architect` (opus) valida; sem mudar `advanceCandle` |
| T3.2 | `team-step.ts`: espera da decisão gravada com prazo, `toTeamSignal`, `walletStep`, gravação das linhas na mesma transação; `live-step.ts` escolhe o caminho pela `signalSource` | Compra/venda em `t + 1`; ignoradas com motivo; prazo estourado = "equipe sem leitura"; decisão tardia nunca aplicada; candle repetido pulado |
| T3.3 | Prova de determinismo: **replay byte a byte** de uma execução de equipe sem provedor e sem chave; retomada no meio sem duplicar; execuções de REGRA inalteradas | `fills`, `signals`, `equity_points` iguais; mutantes do passo (`make live-mutants` +N) |

## Fase 4 — API — exige autorização do plan D9

> 🤖 Modelo: `sonnet` (T4.3 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | `GET /v1/me/model-teams` e `PATCH /v1/me/model-teams/:teamKey` (políticas novas, `access`, `documentation`, Zod); `signalSource` validado em `POST /v1/runs` | Contratos: chave fora do catálogo → `404`; `providerState` do batimento; outro usuário não vê nem muda; `signalSource` sem a equipe ligada → `409 MODEL_TEAM_DISABLED` |
| T4.2 | `GET /v1/runs/:runId/model-teams` (estado, últimas recomendações, placar em SQL + `judgeAgainstCoinFlip`, custos, `comparison` com cursor), `POST .../opinions` (contador diário atômico), `POST /v1/model-duels` e `GET /v1/model-duels/:duelId` | ≤ 5 consultas; o mesmo `404`; `409 RUN_NOT_LIVE`/`ANALYST_NOT_ENABLED`/`MODEL_TEAM_DISABLED`/`MODEL_TEAM_UNAVAILABLE`/`RUN_NOT_RUNNING`/`LIVE_RUN_LIMIT_REACHED` (duelo sem vaga não cria nada); `429`; `400` sem eco; placar = oráculo; p95 ≤ 300 ms |
| T4.3 | Mutantes do filtro de dono (`make api-runs-mutants` +N) e `api-openapi` | Todos os mutantes morrem; documento gerado com as rotas novas |

## Fase 5 — Painel

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | Zod do painel espelhando as rotas; `useModelTeamsQuery` (chave `['runs', runId, 'model-teams']`, polling de 2 s só com `pending`); custo em `BigInt` escala 8 | Contratos com `fake-fetch`; nenhum `Number(` em dinheiro nem nos preços do relatório |
| T5.2 | ◆ vivos na varanda e no escritório: estado (ícone + palavra + cor), balão, ficha com os três papéis, "nuvem da OpenAI", sem "em breve" quando pronto | Texto literal de cada estado; ◆ distinguível sem cor; 44 px; 375 px; contraste `--model` |
| T5.3 | Camada "Equipes ◆" no gráfico (plaquinhas e faixa de entrada/alvo/proteção a partir de `t + 15 min`, degraus nas velas de 3 min) | Sem lookahead visual (teste de `expandLayers`); camada lembrada e desligada por padrão; balão com a recomendação |
| T5.4 | Botão "Pedir opinião agora" e cartão "Equipes × regras" | Botão desabilitado com a frase do motivo; avulso marcado e fora do placar; ✓/✗ certos; "ainda aberta" |
| T5.5 | Duelo (`/duelo/:duelId`): criar, gráfico de patrimônio, ranking com Wilson e custo de API | Linhas com legenda ◆/●; ranking = `equity_points`; frase "Período curto não prova nada" |
| T5.6 | Preferências (Conta): interruptor por equipe; glossário (RF23) | Contratos; foco e teclado; palavras proibidas varridas |

## Fase 6 — Prova de ponta a ponta e fechamento

> 🤖 Modelo: `sonnet` (T6.4 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T6.1 | E2E (`make panel-e2e`, Edge): servidor de controle grava um relatório `decided` (e `pending` → `decided`); a sala e o duelo mostram sem recarregar; preferências ligam/desligam | E2E verde, zero violação de CSP |
| T6.2 ⚠ | **Teste real, manual, com o usuário.** Ele põe as chaves no `envs/env.dev.local` (a I.A. nunca abre esse arquivo) e liga uma equipe de cada provedor; um "Pedir opinião agora" por provedor; mede os tokens reais para fechar a hipótese da spec §8 | Tokens, custo, latência e recomendação de cada um em `evidence.md`; varredura dos logs sem a chave; sem chave, registrar "pendente" e seguir |
| T6.3 | Revisão de design a 375 e 1280 px nos dois temas; **uma** captura final por tema | Capturas em `evidence.md` |
| T6.4 | `CLAUDE.md` (pacote `model-agents`, env, rotas, alvo `make model-teams-test`) | Diff revisado |

## Fase 7 — Níveis do modelo comandando a ordem (opção B; SÓ DESENHO; não executar sem autorização)

> 🤖 Modelo: 🧠 `opus` (desenho e revisão do arquiteto) → `sonnet` (execução)

| Task | O quê | Aceite |
|---|---|---|
| T7.0 🧠 | **Parar e perguntar.** Só com a autorização registrada e ≥ 30 recomendações contadas por equipe: comando de entrada com níveis no motor, `ENGINE_VERSION`, dourado, harness estendido, ADR | Revisão do arquiteto no ADR; contrafactual (níveis da equipe × níveis do risco) em `evidence.md` antes de qualquer código |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/015-agentes-de-modelo/ (leia spec.md, plan.md e tasks.md antes de
começar; contexto em specs/007-analista-de-risco-senior/, specs/011-sala-da-equipe/escritorio.md, specs/017-grafico-em-velas-menores/
e no ADR 0002 §"Analista de risco (spec 007)"). Uma task por vez, na ordem do tasks.md. Execute SÓ o que a autorização do
usuário já cobre: Fases 0 e 1 não pedem nada; a Fase 2 pede a migration 0027; as Fases 3 e 4 pedem a mudança de API e de
worker do plan D9; a Fase 7 NÃO é executada.
ANTES DE TUDO: confira em specs/015-agentes-de-modelo/evidence.md as respostas do usuário ao spec.md §9. Sem resposta,
padrões A, MAS a migration 0027 (T2.1) e as mudanças de API/worker da Fase 3 e 4 só com autorização registrada: sem ela,
PARE e pergunte.
Modelos: Fase 0 → executor model=sonnet · Fase 1 → executor model=sonnet (T1.1b e T1.3b → executor model=haiku) · Fase 2 →
executor model=sonnet · Fase 3 → executor model=sonnet (T3.1 🧠 → validar o desenho com architect model=opus antes) ·
Fase 4 → executor model=sonnet (T4.3 → executor model=haiku) · Fase 5 → executor model=sonnet · Fase 6 → executor
model=sonnet (T6.4 → executor model=haiku) · revisão final → code-reviewer model=sonnet e security-reviewer model=sonnet
(chaves, privacidade do prompt, higiene do texto do modelo, os três adaptadores).
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado
(git commit -- <caminhos>), evidência em evidence.md. Rode os gates no Linux/WSL.
Regras: a decisão do modelo é ENTRADA GRAVADA (o passo da execução de equipe só lê a linha, nunca chama o provedor; o replay
dá o mesmo resultado byte a byte); a ordem executa em t+1, sem lookahead; as execuções de REGRA ficam byte a byte iguais com
e sem equipes. O passo ao vivo só enfileira; falha de provedor nunca derruba nada. Chave só no worker, nunca em
log/erro/linha/resposta/batimento/commit/terminal; a I.A. nunca lê, escreve nem imprime envs/env.dev.local nem chave real.
Ids de modelo e preços só por env (sem padrão no código). Só dado público de mercado no prompt (strictObject), nada do
usuário. Sem SDK e sem dependência nova (fetch + Zod). Teto de custo com reserva antes de chamar. Toda fala de interface
sem "vai subir", "garantido", "recomendamos", "compre", "venda", "confiante". Tudo simulado: nenhuma ordem real, nenhuma
chave de corretora, nada de modo live.
Não mude packages/strategy-engine nem a regra analyst-1; packages/run-recording só no export ADITIVO autorizado da T3.1.
Pare e pergunte antes de: a migration 0027, deploy, mudança de API/worker não autorizada, qualquer chamada a provedor REAL
(só a T6.2, com o usuário), mudar o motor, dependência nova, a Fase 7, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, mexer nos containers ativada-dev-*.
UI: verifique por texto (read_page, get_page_text); screenshot só na T6.3.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
