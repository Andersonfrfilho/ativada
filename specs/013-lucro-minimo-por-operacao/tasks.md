# Tasks — Spec 013

Cada task fecha com: `bun run typecheck` + `bun run lint` + `bun run format:check` + testes + commit isolado + evidência em
`evidence.md`. Rodar os gates no Linux/WSL, num espelho em disco Linux (`rsync` sem `node_modules`; no Windows, fixtures
com `new URL(...).pathname` quebram). Teste novo do painel entra na lista explícita do script `test` do `package.json` do
painel. Alvos `make *-test` um por vez.

**Antes de começar:** as decisões do `spec.md` §9 precisam de resposta do usuário. Sem resposta, a execução segue os
padrões A, **exceto** o que exige autorização e nunca acontece sem ela registrada em `evidence.md`:

| O quê | Onde | Exige |
|---|---|---|
| Campo novo em `RunParameters` e checagem no `placeEntry` (D1-A) | Fase 1 inteira | **mudar o motor** |
| Motivo `below_minimum_profit` no `CHECK` de `orders` (D3-A) | T2.1 | **migration aditiva** |
| Padrão 0,6% pré-preenchido no painel (D2-A) | T3.1 | resultado da T0.2 em `evidence.md` |

**Dependências:** spec 007 em execução por outro executor (Fase 4, worker/API). **Não tocar** em `specs/007*`,
`packages/risk-analyst`, `apps/worker-ativada/src/live/analyst*`, `apps/worker-ativada/src/live/govern-*`,
`test/live-analyst-*` nem nos fixtures `test/fixtures/live/analyst-*` até a 007 fechar; a T4.2 é a única task que mexe no
analista e só começa depois disso. Antes de cada fase: `git status --short --branch` e conferir se a 007 mexeu no motor
(`entry-order.ts`, `engine-vocabulary.constant.ts`) desde 2026-10-16.

## Fase 0 — Contrato e medição

> 🤖 Modelo: `opus` 🧠 na T0.1 (decisão herdada por todas as fases) · `sonnet` na T0.2

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Fechar `minimum-profit-1` (plan D2): nome e limites do campo, fórmula e arredondamento, ordem das checagens em `placeEntry`, motivo novo, sem `.default`, decisão sobre `ENGINE_VERSION`/`RUN_PARAMETERS_SCHEMA_VERSION` (precedente A21), composição com o analista (plan D4), a consulta das recusas no `live-status` dentro do teto de 5, a frase fechada e a ordem de deploy/reversão (plan D9) | Seção "Lucro mínimo por operação (spec 013)" no ADR 0002, validada por `architect` (opus); se algo exigir mudar o sinal, o estado do motor ou o analista, **parar e perguntar** |
| T0.2 | Medição com dados reais (plan D8): estender `scripts/minimum-edge-estimate.ts` com os 183 dias de 15 min dos 4 pares (só `SELECT`), Placar clássico e Reversão, mínimos 0 / 0,3% / 0,6% / 1,0%; `--counts` antes e depois | Tabela em `evidence.md` (operações, taxas, líquido, maior queda pelo vale, compras barradas); se a 0,6% as taxas de 15 min não caírem ≥ 50% em algum par ou o 1 h piorar, **parar e perguntar** sobre o padrão D2 |

## Fase 1 — Motor (🔒 exige autorização: mudar o motor)

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `RUN_PARAMETERS_SCHEMA.minimumNetTargetRate` opcional (0 a 0,1, 8 casas, sem `.default`), `ORDER_EVENT_REASON.BELOW_MINIMUM_PROFIT`, export no `index.ts` | Hash-dourado literal de `classic-scoreboard.run.json` IDÊNTICO; teste do esquema (aceita 0, 0,006, 0,1; recusa −0,001, 0,1000001, 9 casas, número); `warnRunParameters` com os dois avisos (contas à mão) |
| T1.2 | `risk/entry-profit-edge.ts` (`computeRoundTripCostRate`, `computeEntryProfitEdge`, `isEntryProfitable`) e a checagem em `placeEntry` na ordem do plan D2 | Contas à mão dos 6 casos de borda (plan D7); dourado `engine-2` dos conjuntos reais IDÊNTICO byte a byte; dourado do analista intacto; lint de tamanho (≤ 40 linhas por função, ≤ 200 por arquivo) |
| T1.3 | Provas do motor (plan D7): dourado novo com `scripts/record-engine-minimum-profit-golden.ts`, oráculo independente + diferencial (≥ 3.000), oráculo `bigint` da carteira com a recusa, propriedades (2.000), harness de 21 verificações com o campo, mutantes `test/minimum-profit-mutants.contract.test.ts` (≥ 12) | Dourado literal; diferencial e propriedades verdes; harness verde; todos os mutantes MORTOS e a cópia de controle viva; `make contract-full` verde |

## Fase 2 — Banco e API (🔒 T2.1 exige autorização: migration)

> 🤖 Modelo: `sonnet` (T2.3 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | Migration `00NN_orders_minimum_profit` (número livre na hora): recria `orders_reason_check` com `below_minimum_profit` (`NOT VALID` + `VALIDATE`); `.rollback.sql` aborta se houver linha com o motivo; `ORDER_REASON` do banco | `make migration-test` e `make database-test` verdes; rollback testado com e sem linha |
| T2.2 | API: `runParametersBodySchema` aceita o campo; `GET /v1/runs/:id` com `minimumProfit.skippedEntries`; desfecho `waited_minimum_profit` e frase fechada em `decision-messages.ts` (X para baixo, Y e Z para cima; frase sem números quando o sinal não tem ATR); OpenAPI | Contratos `test/api-run-minimum-profit.contract.test.ts` (aceita, `400` sem eco, `404` entre usuários, contagem, frase literal, ≤ 5 consultas por pedido); mutantes da frase e do filtro de dono (`make api-runs-mutants` +1 filtro) |
| T2.3 | Paridade com o campo ligado: uma execução por conjunto real em `make backtest-test`, `make live-test` e `make walkforward-test` (por janela) | Os três alvos verdes, com `fills` e `orders` iguais entre backtest e ao vivo e o walk-forward por janela igual ao motor completo |

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (T3.3 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `MinimumProfitField` + `RoundTripCostNote` no formulário de backtest e na criação da simulação ao vivo (plan D6); padrão 0,6 só com a T0.2 registrada; esquema Zod do painel com o campo | Contratos: padrão, desligar = campo ausente no corpo, custo 0,30% com as taxas padrão e recalculado ao mudar taxa/slippage (`BigInt`, para cima), `percentToFraction` sem `Number`, texto literal com "Não garante lucro" |
| T3.2 | Detalhe da execução ("Lucro mínimo por operação" e "Compras que a regra barrou") e a linha "Esperou" do desfecho novo na `DecisionsTable`; termo `minimumProfit` no glossário | Contratos com a frase EXATA do servidor; estado com ícone + palavra + cor |
| T3.3 | Revisão de design: 375 px, contraste nos dois temas, alvos de 44 px, `prefers-reduced-motion`, `design-review` | `test/contrast.contract.ts`, `test/touch-targets.contract.ts`, `test/design-review.contract.ts` verdes |

## Fase 4 — Revisão final

> 🤖 Modelo: `sonnet` (T4.2 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Revisão (`code-reviewer` sonnet) do motor, da API e do painel; T0.2 rodada de novo com o código final (a regra no motor em vez do `entryRiskScale` do script) e comparada; `CLAUDE.md` (motor e painel) e ADR atualizados | Números da T0.2 iguais pelo motor (diferença explicada se houver); `make panel-e2e` verde (Edge, `PANEL_E2E_BROWSER_CHANNEL=msedge`) com uma simulação de campo ligado; uma captura final em `evidence.md` |
| T4.2 | **Só depois que a 007 fechar:** `packages/risk-analyst/src/market-readings.ts` passa a usar `computeRoundTripCostRate` do motor (um lugar só para o custo) | Dourado `analyst-1` IDÊNTICO; mutantes do analista todos mortos; contratos `risk-analyst-*` verdes |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/013-lucro-minimo-por-operacao/ (leia spec.md, plan.md e tasks.md antes
de começar). Uma task por vez, na ordem do tasks.md.
ANTES DE TUDO: confira em evidence.md as respostas do usuário às decisões do spec.md §9. Sem resposta, siga os padrões A,
mas SEM autorização registrada: NÃO mude packages/strategy-engine (Fase 1 inteira) e NÃO crie migration (T2.1). Nesses
pontos pare e pergunte. O padrão 0,6% do painel (T3.1) só depois da T0.2 registrada.
Modelos: T0.1 🧠 → opus, validada por architect model=opus · T0.2 → executor model=sonnet ·
Fase 1 → executor model=sonnet (T1.1 → executor model=haiku) · Fase 2 → executor model=sonnet (T2.3 → executor
model=haiku) · Fase 3 → executor model=sonnet (T3.3 → executor model=haiku) · T4.1 → executor model=sonnet +
code-reviewer model=sonnet · T4.2 → executor model=haiku, só depois que a spec 007 fechar.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado, evidência em
evidence.md. Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL num espelho em disco Linux (rsync sem node_modules); alvos make *-test um por vez.
A regra só tira operação: decide só a ENTRADA nova, nunca bloqueia saída, nunca muda tamanho, alvo ou stop.
Campo ausente = comportamento antigo exato: dourado engine-2, runHash do exemplo e dourado analyst-1 idênticos byte a byte.
Sem lookahead: ATR e fechamento de t; a compra liberada sai na abertura de t+1.
Toda frase traz "não garante lucro"; nunca "vai subir", "garantido" ou "recomendamos".
Tudo simulado: nenhuma ordem real, nenhuma chave de corretora, nada de modo live.
NÃO toque em specs/007*, packages/risk-analyst, apps/worker-ativada/src/live/analyst*, apps/worker-ativada/src/live/govern-*,
test/live-analyst-* nem test/fixtures/live/analyst-* (outro executor) até a 007 fechar.
Pare e pergunte antes de: deploy, qualquer migration, mudar o motor, mudar o analista, dependência nova, se a T0.2 mostrar
taxas de 15 min caindo menos de 50% a 0,6% ou o 1 h piorando, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, apagar volumes que não sejam os descartáveis do projeto,
mexer nos containers ativada-dev-*. Medição só em memória ou SELECT, em scripts/ (nunca src), sem escrever no banco.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T4.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
