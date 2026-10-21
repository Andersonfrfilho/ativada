# Tasks — Spec 003

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (plan D6).

## Fase 0 — Legalizar o que já foi feito

> 🤖 Modelo: `sonnet` (T0.1 é 🧠 — validar com `opus` antes)

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Decidir onde mora a tabela de tick/passo por par (constante na API x `packages/market-data-crypto` x `exchangeInfo` da Binance no backfill) | Decisão registrada no ADR 0002 |
| T0.2 | Aplicar a decisão da T0.1 e escrever o contrato: PEPEUSDT recebe tick `0.00000001`; BTCUSDT mantém o `runHash` de antes; valor enviado pelo usuário vence a tabela | Contrato verde + teste de mutação removendo o espalhamento da tabela |
| T0.3 | Contrato do `hint` em `TextField`/`SelectField` (texto visível e `aria-describedby`) e teste de contraste de `--ink-3` sobre `--surface` nos dois temas | Contratos verdes; commit do visual |

## Fase 1 — Motor do comparador

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `architect` em `opus` antes de implementar)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 🧠 | Extrair de `goal-windows.ts` a parte comum (próxima compra + trajetória) sem mudar o resultado das metas | Dourado das metas inalterado byte a byte |
| T1.2 | `computeHorizonWindows` + `summarizeHorizon` (mediana, % positivas, pior 10%, comprar e segurar) | Contas à mão em 3 séries sintéticas; propriedades (mediana entre mín. e máx.; p10 ≤ mediana) |
| T1.3 | `recommendHorizon` com os limiares do spec §5 em `horizon.constant.ts` | Um teste por regra (elegibilidade, desempate, histórico curto, nenhum elegível) + mutantes dos limiares |
| T1.4 | `summarizeIntraday` sobre as métricas do backtest (`NAO_COMPENSA` por líquido ≤ 0 ou taxa > 50% do bruto) | Contratos com métricas reais gravadas de BNB e LINK |

## Fase 2 — API

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | Tarefa nova no pool de metas + portão a frio + cache (plan D4) | Contrato: segunda chamada não recalcula; quinta a frio no minuto → 429 |
| T2.2 | `GET /v1/horizons` com `access`, `documentation`, Zod, frases (`horizon-messages.ts`) | `api-openapi` verde; contrato negativo entre usuários (404); par desabilitado (400) |
| T2.3 | Linha de 15 min em memória com `advanceCandle`, sem gravar `runs` | Contrato: nenhuma linha nova em `runs`; paridade com um backtest gravado do mesmo período |

## Fase 3 — Painel

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | Rota `/prazos`, item "Prazos" no menu com ícone, `horizon.query.ts` + `horizon.validation.ts` | Contrato de rota e de validação (resposta inválida não renderiza) |
| T3.2 | Tabela de linhas com selo "Recomendável", frase do servidor, aviso de histórico, estado "nenhum prazo" | Contrato com a resposta dos dois casos do spec §7.2 |
| T3.3 | Link "Comparar prazos desta moeda" na meta | Contrato de navegação |
| T3.4 | Revisão de design (web.md §15): 375 px sem rolagem, contraste do selo nos dois temas, uma captura como prova | Captura anexada em `evidence.md` |

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Atualizar `CLAUDE.md` (seção do painel e do motor) | Diff revisado |
| T4.2 | Revisão final e auditoria §15 do code-standart (N+1, I/O, `Promise.all`, logs sem PII) | Relatório em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/003-comparador-de-prazos/ (leia spec.md, plan.md e tasks.md
antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet · T0.1 🧠 → opus (decidir e registrar no ADR 0002) ·
Fase 1 → executor model=sonnet · T1.1 🧠 → validar com architect model=opus antes de implementar ·
Fases 2 e 3 → executor model=sonnet · revisão final → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + testes + commit isolado, evidência em evidence.md.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (plan D6).
Pare e pergunte antes de: deploy, migration destrutiva, mudar os limiares do spec §5, qualquer
[NEEDS CLARIFICATION]. PROIBIDO: git push, git reset, git commit --amend, apagar volumes que não sejam os
descartáveis do projeto. UI: verifique por texto; screenshot só uma vez, na T3.4.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
