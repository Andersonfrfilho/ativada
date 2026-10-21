# Tasks — Spec 005

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script `test` do
`package.json` do painel.

## Fase 0 — Contrato

> 🤖 Modelo: `sonnet` (T0.1 é 🧠 — `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Fechar o contrato das três rotas (plan D2), o algoritmo de redução (D3), o limite e o agrupamento de marcadores (D4) e a regra de "pago/recebido/%" (spec D5); conferir índices de `candles` e `fills` e a lista real de `exitReason` | Seção "Operações no gráfico (spec 005)" no ADR 0002 |

## Fase 1 — API

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `/trades` aditivo: junta os `fills` da posição, campos do plan D2, filtro `from`/`to`; OpenAPI atualizado | Contrato com valores conferidos contra `fills`; `netProfitRate` para baixo; contrato antigo do `/trades` continua verde; `api-openapi` verde |
| T1.2 | `listPriceColumns` (SQL do plan D3) e `listFillMarkers`/contagem no repositório, com `userId` no tipo; índice aditivo se a T0.1 pedir (migration + `.rollback.sql`) | Oráculo puro em `test/` bate com o SQL em 3 séries sintéticas e no conjunto real; `make database-test` verde |
| T1.3 | `GET /v1/runs/:runId/chart` com `access`, `documentation`, Zod, `CHART_MARKER_LIMIT` | 404 entre usuários; 400 com todos os erros (`columns`, `from > to`); 500 → marcadores, 501 → agrupamentos; ao vivo para na última vela fechada |
| T1.4 | `GET /v1/runs/:runId/trade-summary` + `trade-summary-message.ts` | Reconciliação em decimal exato com a soma de `net_profit` e com o `log.csv`; 404 entre usuários |
| T1.5 | Mutantes do filtro de dono das três rotas e carga medida (plan D9) em `make api-runs-test` | Mutantes mortos; p95 e tamanho do `/chart` registrados em `evidence.md` (≤ 300 ms, ≤ 150 KB) |

## Fase 2 — Painel: base

> 🤖 Modelo: `haiku` (T2.2 e T2.4 → `sonnet`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | Zod espelhado (`trade-chart.validation.ts`, `trade-summary.validation.ts`, campos novos em `Trade`) e as consultas sob a chave `runs` | Contrato: resposta inválida não renderiza; chave começa com `runs` |
| T2.2 | `zoned-time.ts` (`formatInZone`, `zoneLabel`) + `useUserTimeZone` | Contrato com `America/Sao_Paulo` (GMT−3) e `America/New_York` dos dois lados da troca de horário; fuso inválido cai no padrão |
| T2.3 | `glossary.constant.ts` com as frases do spec RF13 | Contrato: cada termo tem frase de uma linha, sem repetição |
| T2.4 | `Term.component.tsx` (botão "?", abre por foco/toque/clique, `Esc` fecha, `aria-describedby`) e aplicação em `MetricsCard`, `CompareTable` e `CostsCard` | Contrato de teclado e de leitor de tela; mesma frase em todas as telas |

## Fase 3 — Gráfico

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `price-chart.ts` puro: faixa → pixels, colunas → caminho da linha e da faixa, marcador → posição (compra abaixo, venda acima), agrupamento | Contas à mão + propriedades (todo marcador dentro do SVG; ≤ 2.000 pontos; ordem de tempo preservada) |
| T3.2 | `PriceChart`, `TradeMarker`, `MarkerCluster`, `MarkerTooltip`: setas com forma diferente, foco por teclado em ordem de tempo, dica com os campos do RF03 | Contrato: dica de compra e venda com valores do fixture; Tab/setas percorrem; Enter no agrupamento aproxima |
| T3.3 | `ChartRangeControls` + `useTradeSelection` (faixa na URL, atalhos, anterior/próximo, campos de data) | Contrato: URL muda; "voltar" restaura; atalho maior que o período some |
| T3.4 | `chart-description.ts` e o resumo textual ligado ao SVG (`role="img"` + `aria-describedby`) | Contrato do texto com números do fixture |

## Fase 4 — Tabela, resumo e seleção

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | `virtual-rows.ts` + `useVirtualRows` + `TradesTable` com as colunas do RF07 e o cabeçalho com o fuso | Contrato: 1.000 operações → ≤ 60 `<tr>` no DOM; `aria-rowcount`/`aria-rowindex` certos; propriedades da função pura |
| T4.2 | Cartão de resumo (frase do servidor + números) e o aviso fixo do RF16 | Contrato com o fixture; aviso presente nos dois tipos de execução |
| T4.3 | Seleção ligada (RF10): linha ↔ setas, centralizar faixa, rolar até a linha, `?operacao=` | Contrato dos dois sentidos, inclusive operação fora da faixa |
| T4.4 | Montar o cartão "Preço e operações" no detalhe do backtest e do walk-forward (fora da amostra) | Contrato de rota: cartão aparece em `completed`; `queued`/`running` mostram o progresso de hoje |

## Fase 5 — Simulação ao vivo

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T5.1 | Cartão no detalhe da `live_paper`, "acompanhando" × faixa fixa, aviso "Há operações novas — ir para o fim", rótulo "última vela fechada às HH:MM" | Contrato: aviso do stream invalida e a seta nova aparece; com faixa fixa, a faixa não se move |
| T5.2 | Link "Ver compras e vendas no gráfico" na "Visão geral" | Contrato de navegação |
| T5.3 | E2E em `make panel-e2e`: backtest pela tela → cartão com setas e tabela; ao vivo com preenchimento pelo servidor de controle → seta nova | E2E verde |

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T6.1 | Revisão de design (web.md §15): 375 px sem rolagem horizontal, contraste das setas, linha, faixa e dica nos dois temas, foco visível, comparação com os cartões vizinhos; **uma** captura final | Captura anexada em `evidence.md`; divergências corrigidas ou listadas |
| T6.2 | Atualizar `CLAUDE.md` (seção do painel e das rotas de execução) | Diff revisado |
| T6.3 | Revisão final e auditoria §15 do code-standart (N+1 no `/trades`, `Promise.all`, logs sem PII, sem stack trace no 500) | Relatório em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/005-operacoes-no-grafico/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: T0.1 🧠 → opus (fechar o contrato e registrar no ADR 0002) · Fase 1 → executor model=sonnet ·
Fase 2 → executor model=haiku (T2.2 e T2.4 → executor model=sonnet) · Fases 3, 4 e 5 → executor model=sonnet ·
revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + testes + commit isolado, evidência em evidence.md.
Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
Não mude packages/strategy-engine nem packages/run-recording (spec RNF08).
Pare e pergunte antes de: deploy, migration destrutiva, mudar o limite de 500 marcadores ou o teto de 2.000 colunas,
remover ou mudar o tipo de qualquer campo existente de /v1/runs/:runId/trades, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, apagar volumes que não sejam os descartáveis do projeto.
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T6.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
