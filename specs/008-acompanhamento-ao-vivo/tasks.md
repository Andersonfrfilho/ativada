# Tasks — Spec 008

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script `test` do
`package.json` do painel.

## Fase 0 — Contrato

> 🤖 Modelo: `opus` 🧠 (decisão herdada por todas as fases)

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Fechar o contrato das três rotas (plan D2), as leituras gravadas → `ScoreboardReadings` (D3) com **paridade** contra `computeLatestTriggers` nos dois conjuntos reais, o catálogo de frases (D4), as contas de dinheiro e o instante do prazo da meta (D5); conferir os índices de `signals`, `equity_points`, `positions` e `candles` usados | Seção "Acompanhamento ao vivo (spec 008)" no ADR 0002; teste de paridade em `test/live-stored-readings-parity.contract.test.ts` verde; se a paridade falhar ou faltar índice, **parar e perguntar** |

## Fase 1 — API

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `live-balance.ts`, `live-goal-progress.ts`, `stored-readings.ts` puros | Contas à mão + propriedades (arredondamento contra o usuário; nunca negativo onde não pode) |
| T1.2 | `decision-messages.ts`, `trigger-messages.ts`, `live-status-messages.ts` (catálogo do plan D4) | Texto literal esperado para cada caso: esperou, comprou, vendeu, comprada esperando, aquecendo, filtro de regime, acima/abaixo/empatada |
| T1.3 | Leituras em `packages/database/src/run-results/run-live-status.ts` com `userId` no tipo | `make database-test` verde; isolamento entre usuários; ordem decrescente e cursor |
| T1.4 | `GET /v1/runs/:runId/live-status` + `GET /v1/runs/:runId/decisions` (`access`, `documentation`, Zod de entrada e saída, `RUN_LIVE_STATUS` 60/min) | Contratos (`loadApiApp()`): 404 entre usuários, 409 em backtest, 400 com todos os erros, sem vela, aquecendo, comprada, com/sem meta, desfecho; `api-openapi` verde; ≤ 6 consultas por pedido |
| T1.5 | `/chart` com `decisions` opcional (≤ 500 velas, só `live_paper`) | Contrato novo e o antigo do `/chart` verdes; `null` acima de 500 |
| T1.6 | Mutantes `test/api-run-live-status-mutants.contract.test.ts` e +4 em `scripts/api-runs-mutants.ts` | Todos mortos; `make api-runs-mutants` verde |

## Fase 2 — Painel: base

> 🤖 Modelo: `haiku` (T2.3 → `sonnet`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | Zod espelhado (`live-status.validation.ts`, `decisions` no `/chart`) e consultas sob a chave `runs` | Contrato: resposta inválida não renderiza; chaves começam com `runs` |
| T2.2 | Glossário: vela, pontuação do placar, limiar, comprar e segurar, stop, alvo | Contrato: frase de uma linha por termo, sem repetição |
| T2.3 | `decision-text.ts` (hora do fechamento no fuso com hoje/ontem, pontuação "1 de 2", formatação de dinheiro e % na direção do servidor) | Contrato com `America/Sao_Paulo` e `America/New_York`; virada do dia; nunca `Number` em dinheiro |

## Fase 3 — Cartão "Acompanhamento"

> 🤖 Modelo: `sonnet` (T3.6 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `LiveTrackingCard` com `LiveBalanceBlock` e `LiveGoalBlock` no topo do detalhe `live_paper`; `TradeChartCard` também em parada/concluída | Contrato com fixture: saldo, resultado, comprar e segurar e meta com os números do fixture; desfecho; sem meta o bloco some |
| T3.2 | `DecisionsTable` + `DecisionRow` + `DecisionVotes` (expansível, "Ver decisões anteriores", "Detalhe técnico"); lista empilhada abaixo de 600 px | Contrato: ordem, frases, teclado (`aria-expanded`), paginação por cursor; aviso do stream acrescenta linha |
| T3.3 | `NextTriggersBlock` e `LiveTrackingNotices` (vela, olhar de 1 h, dinheiro fictício, "pode nunca acontecer") e o estado vazio do RF09 | Contrato dos estados: aguardando entrada, comprada, sem vela, parada, aquecendo; nenhum "0,00" sem frase ao lado |
| T3.4 | Gráfico: pontinho de "esperou" (tipo `decision` em `price-chart-markers.ts`, mesma parada de Tab, dica), `ChartLevels` com alvo/stop e nível de compra (D7) atrás de "Mostrar níveis" | Contrato: pontinhos com ≤ 500 velas e texto acima disso; linhas só com posição aberta; plano de outra versão não desenha; contraste ≥ 3:1 em `test/contrast.contract.ts` |
| T3.5 | Visão geral: linha "Última decisão…" + link no `BalanceCard`; `ActiveGoalCard` com a meta do servidor; `goal-progress.ts` sai | Contrato: textos com o fixture; `goal-progress` some do código e dos testes; `test/goals.contract.tsx` verde |
| T3.6 | E2E (`make panel-e2e`): servidor de controle grava sinal HOLD + ponto de patrimônio → linha "Esperou" e saldo novos | E2E verde |

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Revisão de design (web.md §15): cartão, tabela, gatilhos e gráfico a 375 px nos dois temas, foco visível, nunca só cor, linguagem para leigo; **uma** captura final | Captura em `evidence.md`; divergências corrigidas ou listadas |
| T4.2 | Atualizar `CLAUDE.md` (rotas novas, campo `decisions` do `/chart`, cartão "Acompanhamento", glossário, saída do `goal-progress.ts`) | Diff revisado |
| T4.3 | Revisão final (`code-reviewer` `opus`) e auditoria §15 do code-standart (N+1 nas decisões, ≤ 6 consultas, `Promise.all` × `allSettled` no agregado, logs sem PII, sem stack trace no 500) | Relatório em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/008-acompanhamento-ao-vivo/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: T0.1 🧠 → opus (fechar o contrato, provar a paridade das leituras gravadas e registrar no ADR 0002) ·
Fase 1 → executor model=sonnet · Fase 2 → executor model=haiku (T2.3 → executor model=sonnet) ·
Fase 3 → executor model=sonnet (T3.6 → executor model=haiku) · Fase 4 → executor model=sonnet ·
revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + testes + commit isolado, evidência em evidence.md.
Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
Não mude packages/strategy-engine nem packages/run-recording (spec RNF03). Não recalcule o motor por pedido: decisões,
votos e leituras vêm de signals; saldo de equity_points; alvo e stop de positions.
Dinheiro em texto decimal na API e BigInt no painel, arredondando contra o usuário; nunca Number em dinheiro.
Pare e pergunte antes de: deploy, qualquer migration (a spec não prevê nenhuma), paridade dos gatilhos que não bate
(cair para o pool de threads), mudar o tamanho da página (24) ou o teto de 500 velas dos pontinhos, remover ou mudar o
tipo de campo existente de /v1/runs*, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, apagar volumes que não sejam os descartáveis do projeto.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T4.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
