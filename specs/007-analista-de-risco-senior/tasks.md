# Tasks — Spec 007

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script `test` do
`package.json` do painel.

**Antes de começar:** as decisões do `spec.md` §9 precisam de resposta do usuário. Sem resposta, a execução segue os
padrões A, **exceto** o que exige autorização e nunca acontece sem ela registrada em `evidence.md`:

| O quê | Onde | Exige |
|---|---|---|
| Tabela `analyst_decisions` (D3-A) | T2.1 | migration aditiva |
| Governar a simulação (D1) e o comando de tamanho (D2-A) | Fase 4 inteira | mudar o motor + migration em `run_commands` |
| Colunas `trade_count`/`taker_buy_base_volume` em `candles` | T5.2 | migration aditiva + backfill |
| Fotos do livro de ofertas | T5.3 | migration + retenção |
| Funding/OI, dominância, notícias | T5.4 | fonte externa autorizada, por fonte |

**Dependências:** spec 006 (vela da simulação) e spec 008 Fases 0–1 (prontas). A spec 009 está em execução por outro
executor: **não tocar** em `specs/008*`, `specs/009*` nem nos arquivos que elas criam; o Wilson tem um lugar único (plan D3).

## Fase 0 — Contrato e medição

> 🤖 Modelo: `opus` 🧠 na T0.1 (decisão herdada por todas as fases) · `sonnet` na T0.2

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Fechar `analyst-1`: catálogo dos especialistas (plan D2), auditor e o lugar único do Wilson (D3), a tabela da regra com cada número em `ANALYST_RULES` (D4), o passo sombra/governar (D5), o esquema de `analyst_decisions` (D6), o contrato das rotas (D7), o desenho da mudança no motor (D8, só desenho) e o catálogo fechado de frases | Seção "Analista de risco (spec 007)" no ADR 0002; oráculo do auditor em `test/fixtures/risk-analyst/` (TS puro, sem importar `src`); se algo do plan não fechar sem mudar o motor na Fase 1, **parar e perguntar** |
| T0.2 | Medição de base com dados reais (script em `scripts/`, nada em `src`): auditor dos 4 especialistas e da tendência do Placar clássico em LINK, BNB, BTC e ETH, 15 min e 1 h, 6 meses do banco de dev; grava o recorte de 15 min usado no dourado | Tabela "N de M, Wilson, veredito" por par em `evidence.md`; LINK 1h confere com o preview da 009 (`even`); se **nenhum** especialista provar valor em **nenhum** par, registrar e **parar e perguntar** se segue |

## Fase 1 — Regra pura (`packages/risk-analyst`)

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | Pacote novo (workspace, `tsconfig`, lint, teste de fronteira) + `market-readings.ts` (volume relativo, ATR%, percentis nearest-rank, momentum, custo, razão movimento ÷ custo) e `wilson-interval.ts` (ou o import do lugar único) | Contas à mão; fronteira sem `Date`/`Math.random`/`console`; corte da série dá a mesma leitura |
| T1.2 | `specialist-team.ts` (configs de uma família pelo `signalStep`) e `accuracy-auditor.ts` (contagem, veredito, peso D4) | Paridade do auditor com o oráculo da T0.1 nos conjuntos reais e no recorte de 15 min; bordas 29/30 e limite encostando em 0,5 |
| T1.3 | `team-forecast.ts`, `risk-locks.ts`, `posture-policy.ts`, `analyst-decision.ts`, `analyst-messages.ts` | Contas à mão por etapa da D4; frases literais; propriedades (2.000 sorteios: tamanho ≤ 1, trava → `pause`, equipe contra → `pause`, saída nunca bloqueada) |
| T1.4 | Dourado `analyst-1` (recorte real + sintético) e mutantes `test/risk-analyst-mutants.contract.test.ts` (plan D11, ≥ 20) | Dourado literal; todos os mutantes mortos |

## Fase 2 — Sombra no worker e contrafactual

> 🤖 Modelo: `sonnet` (T2.2 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 ⚠ | **Parar e perguntar** (D3). Autorizado: migration `00NN_analyst_decisions` (+ `.rollback.sql`), schema, repositório com `userId` no tipo, `ownership-registry`, exportação e purga LGPD | `make migration-test`, `make database-test`, `make lgpd-test` verdes; rollback testado. Com D3-B: sem migration; a T2.3 não grava (só calcula para o aviso) e a T3.1 recalcula pelo pacote puro sob demanda |
| T2.2 | `runs.request.analyst` no `POST /v1/runs` (`live_paper`, só 15m, `mode: shadow`; `govern` recusado com `400` até a Fase 4) e Zod | Contratos: 15m aceita, 1h com analista = `400` com a mensagem, outro tipo = `400`, sem analista nada muda |
| T2.3 | `analyst-step.ts` + `load-analyst-context.ts` no worker: leitura das velas por par por ronda, decisão na transação do passo, `pg_notify` `analyst`, falha da sombra grava o código e o passo segue | Fixture `loadAnalystLiveParts()`; `fills` iguais byte a byte com e sem sombra nos conjuntos reais; retomada sem duplicar; ≤ 50 ms p95 com 5 simulações do par; `make live-test` verde |
| T2.4 | Contrafactual (plan D9): `scripts/analyst-counterfactual.ts` em memória | Relatório literal em `evidence.md` (4 pares × 2 estratégias, veredito D11); nenhuma linha gravada em `runs` |

## Fase 3 — API e painel

> 🤖 Modelo: `sonnet` (T3.2 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `GET /v1/runs/:runId/analyst` e `/analyst/decisions` (plan D7), `access`, `documentation`, Zod, `RUN_LIVE_STATUS`; mutantes +2 em `scripts/api-runs-mutants.ts` | Contratos (`loadApiApp()`): feliz em sombra, sem vela, aquecendo, parada; `404` entre usuários; `409` dos dois tipos; `400` sem eco; ≤ 4 consultas; `api-openapi` e `make api-runs-mutants` verdes |
| T3.2 | Zod espelhado, consultas sob a raiz `runs`, glossário (analista de risco, postura, ritmo, especialista, auditor, moeda ao ar, intervalo de confiança, sem previsão, trava, modo sombra), tokens novos se precisar | Contrato do glossário; contraste das cores novas nos dois temas |
| T3.3 | Opção "Deixar o analista de risco decidir" no `SimulationTimeframePicker` (trava a vela em 15 min, explica a taxa), `AnalystCard` (postura, ritmo, tamanho, duração, motivo, aviso fixo), `AnalystTeamTable`, `AnalystLocks`, meta somada, `AnalystHistory` com "Ver decisões anteriores"; selo "modo sombra: o analista só observa" | Contratos de cada estado com o texto literal; estado = ícone + palavra + cor; 375 px por classe; nenhum número calculado no painel além da formatação |
| T3.4 | E2E (`make panel-e2e`): criar simulação com analista, decisão chega pelo `pg_notify` do servidor de controle, cartão muda sem recarregar | E2E verde |

## Fase 4 — Governar (só com autorização de D1 e D2)

> 🤖 Modelo: `sonnet`; T4.1 🧠 validada por `architect` em `opus` antes de implementar

| Task | O quê | Aceite |
|---|---|---|
| T4.0 🧠 | Reescrever a A21 do ADR 0002 pela revisão do arquiteto (variante "1c": teto de entrada por passo, sem estado nem versão nova) e a D2 da spec | ADR e spec atualizados |
| T4.1a | Motivo `analyst_timeout` no vocabulário do motor e do banco + migration `0025_run_commands_analyst` (`NOT VALID` + `VALIDATE`; rollback que aborta com trilha `analyst_%`) | Dourado `engine-2` inalterado; `migration-test`; `database-test` gravando `analyst_timeout`; rollback testado; `strategy-persistence-schema` |
| T4.1b | `entryRiskScale` (`'0' \| '0.25' \| '0.5' \| '1'`) em `StepInput`/`WalletStepInput` e no `advanceCandle`; referência com escala, diferencial com gerador separado, cenário no harness, propriedade de risco, mutantes novos | Dourado `engine-2` idêntico; dourado de escala novo; harness verde; os 51 mutantes antigos e ≥ 6 novos mortos; backtest/walk-forward/ao vivo inalterados |
| ~~T4.1~~ | *(substituída por T4.0/T4.1a/T4.1b; texto original:)* Autorizado: motivos `analyst_*` e, com D2-A, `scale_risk`/`riskScale` no motor (plan D8); versão nova do motor; migration dos `CHECK` de `run_commands` | — |
| T4.2 | Modo `govern` no worker (comandos no `advanceCandle`, falha → `pause`) e liberação do `govern` no `POST /v1/runs` | Contratos: pausa barra entrada e nunca saída; saída por tempo na 5ª vela; tamanho ¼ dá risco ≤ ¼; `make live-test` com paridade backtest × ao vivo com o analista nos conjuntos reais |
| T4.3 | Contrafactual de novo com o comando de tamanho (D9 c) e o painel trocando o selo para "o analista está decidindo" | Relatório em `evidence.md`; contrato do selo |

## Fase 5 — Dados novos (spec §3 Fase 2, na ordem da D6)

> 🤖 Modelo: `sonnet` (T5.1 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | Especialistas "Horário" e "Andando com o BTC" (sem fonte nova) com peso 0 até o auditor aprovar; `analyst-2` | Dourado `analyst-2` regravado; auditor deles na tabela; T0.2 refeita para eles em `evidence.md` |
| T5.2 ⚠ | **Parar e perguntar.** Autorizado: colunas em `candles`, parser de `V`, gravação de `n`, backfill só do que falta; especialistas "Atividade" e "Agressor" | `make migration-test`, `make backfill-test`, `make stream-test` verdes; vela antiga `null` = neutro |
| T5.3 ⚠ | **Parar e perguntar** (retenção). Autorizado: fotos do livro por vela e o especialista "Livro" | Teste com a Binance falsa; auditor só conta depois de 30 previsões ao vivo |
| T5.4 ⚠ | **Parar e perguntar, por fonte.** Funding/OI, dominância, notícias (placar numérico, nunca texto livre) | Dublê local; nenhuma chamada externa em teste; chave só por env validada |

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`, porque a Fase 4 mexe no motor)

| Task | O quê | Aceite |
|---|---|---|
| T6.1 | Revisão de design (web.md §15) do cartão, tabela e histórico a 375 e 1280 px nos dois temas; linguagem para leigo (RNF11); **uma** captura final | Captura em `evidence.md`; divergências corrigidas ou listadas |
| T6.2 | Atualizar `CLAUDE.md` (pacote `risk-analyst`, regra `analyst-1`, rotas, sombra/governar, migrations, alvos `make`) | Diff revisado |
| T6.3 | Revisão final e auditoria §15 do code-standart (N+1, uma leitura de velas por par por ronda, `Promise.all` × `allSettled` — a falha do analista NÃO pode derrubar o passo nem a tela do acompanhamento —, logs sem PII, sem stack trace no 500) | Relatório em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/007-analista-de-risco-senior/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
ANTES DE TUDO: confira em evidence.md as respostas do usuário às decisões do spec.md §9. Sem resposta, siga os padrões A,
mas SEM autorização registrada: NÃO crie migration (T2.1, T4.1, T5.2, T5.3), NÃO mude packages/strategy-engine nem
packages/run-recording (Fase 4 inteira), NÃO chame fonte externa (T5.4). Nesses pontos pare e pergunte.
Modelos: T0.1 🧠 → opus (contrato analyst-1, Wilson único, ADR 0002) · T0.2 → executor model=sonnet ·
Fase 1 → executor model=sonnet (T1.1 → executor model=haiku) · Fase 2 → executor model=sonnet (T2.2 → executor
model=haiku) · Fase 3 → executor model=sonnet (T3.2 → executor model=haiku) · Fase 4 → executor model=sonnet, com a
T4.1 🧠 validada por architect model=opus antes de implementar · Fase 5 → executor model=sonnet (T5.1 → executor
model=haiku) · Fase 6 → executor model=sonnet · revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + testes + commit isolado, evidência em evidence.md.
Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
O analista só tira risco: tamanho <= 1x o riskPerTrade, nunca compra, nunca bloqueia saída, falha = pause (governar)
ou só o código gravado (sombra). Sem lookahead: decisão no fechamento de t com velas <= t.
Tudo simulado: nenhuma ordem real, nenhuma chave de corretora, nada de modo live.
Não toque em specs/008*, specs/009* nem nos arquivos que elas criam (outro executor).
Pare e pergunte antes de: deploy, qualquer migration, mudar o motor, fonte externa, dependência nova, se a T0.2 mostrar
que nenhum especialista prova valor em nenhum par, p95 acima do teto (50 ms no passo, 300 ms nas rotas), qualquer
[NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, apagar volumes que não sejam os descartáveis do projeto,
mexer nos containers ativada-dev-*.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T6.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
