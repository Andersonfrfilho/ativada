# Tasks — Spec 016

Cada task fecha com: `bun run typecheck` + `bun run lint` + `bun run format:check` + testes + commit isolado (só os arquivos
da task, pelo nome) + evidência em `evidence.md`. Gates no Linux/WSL, num espelho PRÓPRIO desta spec: copiar
`gates7.sh` do scratchpad (`C:\Users\ander\AppData\Local\Temp\claude\C--Users-ander-Documentos-personal\cc00ea62-3173-407e-a131-bebea2ff1016\scratchpad\`)
para `gates16.sh` trocando `DST` por `$HOME/gates/ativada-spec16` (o `rsync` exclui `node_modules`, `.git`, `.omc` e
`dist`; no Windows, fixtures com `new URL(...).pathname` quebram). Uso: `bash gates16.sh install|typecheck|lint|format|test
<arquivos>|panel-test`. Teste novo do painel entra na lista explícita do script `test` do `package.json` do painel. Alvos
`make *-test` um por vez.

**Antes de começar:** as decisões do `spec.md` §9 precisam de resposta do usuário. Sem resposta, a execução segue os padrões
A, **exceto** o que exige autorização e nunca acontece sem ela registrada em `evidence.md`:

| O quê | Onde | Exige |
|---|---|---|
| `StrategyConfig.ladder`, `WalletState.ladder`, `positionUpdates`, `computeLadderSize` e a vela por dentro (D1-A, D2-A) | Fase 1 inteira | **mudar o motor** |
| Motivos `ladder_exit_started` e `position_closed` no `CHECK` de `orders` (D3-A) | T2.1 | **migration aditiva** |
| `writePositions` monotônico `open → open` | T2.2 | nada além do gate (sem migration), mas **para** se o `make database-test` mudar qualquer linha antiga |
| Qualquer padrão de escada no painel (D7-B) | T3.1 | resultado da T0.3 em `evidence.md` + resposta do usuário |

**Dependências e coordenação:** outros executores trabalham nas specs 007, 011, 013 e 014. **Não tocar** em `specs/007*`,
`specs/011*`, `specs/013*`, `specs/014*`, `packages/risk-analyst`, `apps/worker-ativada/src/live/analyst*`,
`apps/worker-ativada/src/live/govern-*`, `apps/frontend-ativada/src/notices/` nem nos arquivos de sala/escritório até cada
uma fechar. Antes de cada fase: `git status --short --branch` e `git log --oneline -- packages/strategy-engine/src/wallet
packages/strategy-engine/src/engine-vocabulary.constant.ts packages/database/migrations` desde 2026-10-16 (a 013 vai mexer
em `entry-order.ts`, no vocabulário e criar migration). Número de migration: o livre NA HORA.

## Fase 0 — Contrato, oráculo e medição

> 🤖 Modelo: `opus` 🧠 na T0.1 (decisão herdada por todas as fases) · `sonnet` na T0.2 e na T0.3

| Task | O quê | Aceite |
|---|---|---|
| T0.1 🧠 | Fechar `ladder-1` (plan D1–D7): esquema e validações, `LadderState`, a tabela E1–E9 com o pior caso, `computeLadderSize` e a redução exata a `computePositionSize`, proteção pelo degrau mais fundo e `break_even`, `positionUpdates` opcional, mapeamento para `orders`/`fills`/`positions` e `writePositions` monotônico, motivos novos, hashes e versões (precedente A21/MP7), 013 e 007, deploy e reversão | Seção "Compras e vendas em escada (spec 016)" no ADR 0002, validada por `architect` (opus); se algo exigir mudar o sinal, `ENGINE_VERSION` ou o analista, **parar e perguntar** |
| T0.2 | Oráculo independente `test/fixtures/ladder/ladder-oracle.ts` (TS puro, `bigint`, sem `src` nem `decimal.js`) com `test/ladder-oracle.contract.test.ts`: contas à mão do plan D11 e as propriedades de "nunca aumentar a perda máxima" (2.000 sorteios); modo "posição única" | Contas à mão verdes; o modo "posição única" reproduz EXATO o motor de produção (caixa, operações, taxas, patrimônio) nos 3 conjuntos reais de `test/fixtures/` |
| T0.3 | Medição (plan D8): `scripts/ladder-measure.ts` (só `SELECT`; motor de sinal de produção + carteira do oráculo), 4 pares × 15 min e 1 h × 183 dias × Placar clássico e Reversão × S0, S0w, E3, E4, X3, X3s, E3X3, E3X3be; `--counts` antes e depois | Antes de medir, o oráculo "posição única" = motor nos 16 conjuntos (senão **para**). Tabela completa em `evidence.md` com líquido, maior queda, operações, preenchimentos, taxas, maior valor em jogo, degraus e parcelas atingidos, pior perda e veredito contra S0 e S0w — **sem esconder se a escada piorar** |

## Fase 1 — Motor (🔒 exige autorização: mudar o motor)

> 🤖 Modelo: `sonnet` (T1.1 → `haiku`; T1.3 🧠 → validar com `architect` opus antes de implementar)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 | `LADDER_SCHEMA` em `strategy-config.schema.ts` (`exactOptional`, sem default), tipos, `ORDER_EVENT_REASON.LADDER_EXIT_STARTED`/`POSITION_CLOSED`, export no `index.ts` | Hash-dourado literal do `configHash` e do `runHash` do exemplo IDÊNTICOS; teste do esquema (aceita os modelos; recusa degrau fora de ordem, 1º ≠ 0, 6 degraus, peso 0 ou 101, `exits: []`, `undefined` explícito, falta de `maxEntryCandles`) com todos os erros juntos |
| T1.2 | `risk/ladder-size.ts` (`computeLadderSize`) e `computeLadderLevels` (preços dos degraus, proteção, alvos e % depois do custo), puras, ≤ 40 linhas por função | Contas à mão do exemplo do spec §2; diferencial: um degrau sem parcelas ≡ `computePositionSize` em ≥ 3.000 sorteios; propriedade `perda planejada < R` (2.000) |
| T1.3 🧠 | `WalletState.ladder` + `wallet-state.schema.ts`, a vela por dentro E1–E9 em `wallet/` (arquivos novos `ladder-*.ts`; `fill-model.ts`, `protective-exit.ts`, `signal-policy.ts`, `entry-fill.ts` e `gap-close.ts` só delegam quando há escada), `positionUpdates` opcional | Dourado `engine-2` IDÊNTICO byte a byte; dourado `analyst-1` intacto; harness de 21 verificações com uma estratégia em escada; lint de tamanho |
| T1.4 | Provas (plan D11): diferencial motor × oráculo (≥ 3.000), propriedades (2.000), dourado novo `scripts/record-engine-ladder-golden.ts`, mutantes `test/ladder-mutants.contract.test.ts` (≥ 20) | Tudo verde; todos os mutantes MORTOS e a cópia de controle viva; `make contract-full` verde |
| T1.5 | **Só depois que a 013 estiver no motor:** a 1ª parcela na regra `minimum-profit-1` (plan D7) e os avisos `ladder_exit_below_cost`/`ladder_exit_below_minimum_profit` no caso de uso de criação | Contas à mão (igual passa; 1e-8 abaixo barra); dourados da 013 e `engine-2` idênticos |

## Fase 2 — Banco, gravação e API (🔒 T2.1 exige autorização: migration)

> 🤖 Modelo: `sonnet` (T2.4 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | Migration `00NN_orders_ladder_reasons` (número livre na hora): recria `orders_reason_check` com os dois motivos (`NOT VALID` + `VALIDATE`); `.rollback.sql` aborta se houver linha com eles; `ORDER_REASON` do banco | `make migration-test` e `make database-test` verdes; rollback testado com e sem linha |
| T2.2 | `run-recording` mapeia `positionUpdates` → `positions` aberta; `writePositions` monotônico (`quantity` só cresce, `stop_price` só sobe) | `make database-test`: idempotência, monotonicidade, reaplicação fora de ordem, nenhuma linha antiga muda; contratos de backtest e ao vivo sem escada idênticos |
| T2.3 | `GET /v1/runs/:runId/ladder` (plan D9), leitura `run-ladder.ts` com `OwnerScope`, catálogo `ladder-messages.ts`, OpenAPI; `GET/POST/PUT /v1/strategies*` com `ladder` | Contratos `test/api-run-ladder.contract.test.ts` (números do exemplo, frases literais, `null` sem escada, `400` sem eco, `404` entre usuários, ≤ 4 consultas); `make api-runs-mutants` +1 filtro de dono; mutantes das frases |
| T2.4 | Paridade com escada: uma versão em escada por conjunto real em `make backtest-test`, `make live-test` e `make walkforward-test` | Os três verdes; `fills`, `orders` e `positions` iguais entre backtest e ao vivo; walk-forward por janela igual ao motor completo |
| T2.5 | Plano de operação (D8-A): `computePlanLevels`/`computeHoldingLevels` com degraus e parcelas pela `computeLadderLevels`; `GET /v1/goals/:goalId/plan` aditivo | Dourado do plano sem escada idêntico; contas à mão com escada; mutantes do plano verdes |

## Fase 3 — Painel

> 🤖 Modelo: `sonnet` (T3.4 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | `LadderEditor` no editor de estratégia (desligado por padrão; dois modelos; prévia em frases; custo por parcela em `BigInt`; `percentToFraction`) e `ladder.validation.ts` | Contratos: desligado = sem `ladder` no corpo; modelo "3 compras" e "3 vendas" com os textos do spec §2; aviso quando parcela ≤ custo; "não cria vantagem" literal |
| T3.2 | `LadderCard` no detalhe da execução e na simulação ao vivo; `useLadderQuery`; glossário (compra em partes, venda em partes, preço médio) | Contratos com as frases EXATAS do servidor; estado com ícone + palavra + cor; dinheiro em `BigInt` na direção do servidor |
| T3.3 | **Só com 014, 011 e 009 fechadas:** ficha e plaquinhas (régua com degraus; "Operar à mão" uma linha por ordem), quadro de avisos do escritório (E-RF13) e camada "Níveis" do gráfico (linhas por degrau e parcela, `fake-chart-surface`) | Contratos de cada tela; contraste 3:1 nas linhas; descrição textual do `role="img"` com os degraus |
| T3.4 | Revisão de design: 375 px, contraste nos dois temas, alvos de 44 px, `prefers-reduced-motion`, `design-review` | `test/contrast.contract.ts`, `test/touch-targets.contract.ts`, `test/design-review.contract.ts` verdes |

## Fase 4 — Revisão final

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T4.1 | Revisão (`code-reviewer` sonnet) do motor, do banco, da API e do painel; T0.3 rodada de novo com o MOTOR (não o oráculo) e comparada; `CLAUDE.md` (motor, painel) e ADR atualizados | Números iguais aos da T0.3 (diferença explicada); `make panel-e2e` verde (Edge, `PANEL_E2E_BROWSER_CHANNEL=msedge`) com uma simulação em escada; uma captura final em `evidence.md` |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/016-escada-de-compra-e-venda/ (leia spec.md, plan.md e tasks.md antes de
começar). Uma task por vez, na ordem do tasks.md.
ANTES DE TUDO: confira em evidence.md as respostas do usuário às decisões do spec.md §9. Sem resposta, siga os padrões A,
mas SEM autorização registrada: NÃO mude packages/strategy-engine (Fase 1 inteira) e NÃO crie migration (T2.1). Nesses
pontos pare e pergunte. Nenhum padrão de escada no painel sem a T0.3 registrada e resposta do usuário.
Modelos: T0.1 🧠 → opus, validada por architect model=opus · T0.2 e T0.3 → executor model=sonnet ·
Fase 1 → executor model=sonnet (T1.1 → executor model=haiku; T1.3 🧠 → validar o desenho com architect model=opus antes) ·
Fase 2 → executor model=sonnet (T2.4 → executor model=haiku) · Fase 3 → executor model=sonnet (T3.4 → executor model=haiku) ·
T4.1 → executor model=sonnet + code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado (só os arquivos da task,
pelo nome), evidência em evidence.md. Gates no WSL num espelho próprio: copie gates7.sh do scratchpad para gates16.sh com
DST=$HOME/gates/ativada-spec16 (rsync sem node_modules); alvos make *-test um por vez. Teste novo do painel entra na lista
explícita do script test do package.json do painel.
Sem escada = comportamento antigo exato: dourado engine-2, dourado analyst-1, configHash/runHash do exemplo idênticos byte a
byte; ENGINE_VERSION não muda (precedente A21) — se mudar for necessário, pare e pergunte.
Orçamento de risco TOTAL por posição: perda sem lacuna < riskPerTrade × caixa somando todos os degraus; proteção única abaixo
do degrau mais fundo, nunca desce; nenhum degrau novo depois do plano; no máximo 5 degraus e 5 parcelas.
Sem lookahead: plano decidido em t, 1º degrau em t+1; na vela, pior caso (proteção vence alvo; degrau no meio da vela bloqueia
alvo; tocar não basta para limitada).
A medição (T0.3) diz a verdade: se a escada piorar, isso vai em destaque para evidence.md e para o usuário. Toda tela da
escada traz "não cria vantagem"; nunca "garantido", "vai subir", "recupera a perda" ou "recomendamos".
Tudo simulado: nenhuma ordem real, nenhuma chave de corretora, nada de modo live.
NÃO toque em specs/007*, specs/011*, specs/013*, specs/014*, packages/risk-analyst, apps/worker-ativada/src/live/analyst*,
apps/worker-ativada/src/live/govern-*, apps/frontend-ativada/src/notices/ nem nos arquivos da sala/escritório até cada spec
fechar (T1.5 e T3.3 esperam por elas).
Pare e pergunte antes de: deploy, qualquer migration, mudar o motor, mudar o analista, dependência nova, se o oráculo
"posição única" divergir do motor, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, apagar volumes que não sejam os descartáveis do projeto, mexer
nos containers ativada-dev-*, escrever no banco de dev. Medição só em memória ou SELECT, em scripts/ (nunca src).
UI: verifique por texto (read_page, get_page_text); screenshot só uma vez, na T4.1.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```
