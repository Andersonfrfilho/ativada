# Tasks — Spec 011

Cada task fecha com: `bun run typecheck` + `bun run lint` + testes + commit isolado + evidência em `evidence.md`.
Rodar os gates no Linux/WSL (spec 003, plan D6). Teste novo do painel entra na lista explícita do script `test` do
`package.json` do painel.

**Antes de começar:** confira em `evidence.md` as respostas do usuário às decisões do `spec.md` §10. Sem resposta, valem
os padrões A, **exceto** a D4-A, que exige autorização registrada.

| O quê | Onde | Exige |
|---|---|---|
| Motivo por regra (`ruleVotes`, `motive`, frases novas) — muda o contrato da 007 (A16, A17, A20) | T1.1 | autorização + 007 Fase 3 fechada e sem outro executor nela |
| Mudar a regra `analyst-1` (ex.: `too_volatile` × `team_against`, "em observação" para todos) | fora desta spec | `analyst-2` na spec 007 |

**Dependências:** spec 007 **Fases 2 e 3** prontas (decisão gravada ou recalculada, rotas `/analyst` e
`/analyst/decisions`, Zod e glossário do painel, `AnalystCard`). Se não estiverem, **parar e perguntar**. Não tocar em
`specs/007*`, `specs/008*`, `specs/009*` nem nos arquivos que elas criam fora do que a T1.1 autorizada pedir.

## Fase 0 — Conferência

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T0.1 | Conferir que a 007 entregou `GET /v1/runs/:runId/analyst` e `/analyst/decisions` com a forma da A20, o Zod espelhado no painel e a fixture de teste; listar o que falta para a sala (`verdictLabel` na view, `motive`) | Tabela "campo da sala → campo da view" em `evidence.md`; se faltar rota ou fixture, **parar e perguntar** |

## Fase 1 — Dados da sala

> 🤖 Modelo: `sonnet` (T1.2 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T1.1 ⚠ | **Parar e perguntar (D4).** Autorizado: `ruleVotes` em `specialists`, `describeSpecialistMotive` com as frases da §5 da spec, `motive` e `verdictLabel` na view da A20; ADR 0002 atualizado (adendo "Sala da equipe (spec 011)") | Frases literais por regra e voto; igualdade com `describeRuleCondition` da 008; dourado `analyst-1` regravado só no campo novo (decisão igual byte a byte); varredura de palavras proibidas; `api-openapi` verde. Com D4-B: só `verdictLabel` (sem frase nova) e o balão sem motivo |
| T1.2 | `team-room-view.ts` (plan D2) + Zod do painel com os campos novos (opcionais: decisão antiga sem `motive`) | Contas à mão: todos os votos e tons, 29/30 contadas, peso 0, `strategy`; nenhum `Number(` (contrato) |

## Fase 2 — Sala no painel

> 🤖 Modelo: `sonnet`

| Task | O quê | Aceite |
|---|---|---|
| T2.1 | `TeamFigure` (seis personagens em SVG, roupas por classe com tokens `--shirt-*`), `SpeechBubble`, `AuditorPlacard`, `team-room.module.css` (container query lista/sala, piso isométrico) | Contrato de render por papel; `design-review` sem `style=`; contraste dos tokens novos nos dois temas |
| T2.2 | `TeamRoomStage`, `SpecialistSeat`, `AnalystSeat`, `AuditorSeat`, `AuditorClipboard`, `TeamRoomLines`, `TeamRoomCard` com os estados da A20 e o erro | Contratos com a fixture: texto literal de cada balão e plaquinha; quieto/votou; `unavailable` e `failed`; lista = palco; palco `aria-hidden` sem focável; 375 px por classe |
| T2.3 | `use-team-room-sequence.ts` + `team-room-timeline.constant.ts` + keyframes; botão "Animação" e preferência lembrada | Relógio falso: ordem, ≤ 1,8 s, `aria-live` uma vez, `prefers-reduced-motion` e desligado = estado final no primeiro quadro, limpeza no desmonte e na troca de vela; `design-review` |
| T2.4 | `TeamRoomNavigator` (rever velas com `/analyst/decisions`, "Ver decisões anteriores", "Voltar para agora"), recolher a sala, "Repetir" | Contratos: vela revista sem animação, selo "Revendo a vela das HH:MM" no fuso, 44 px (`touch-targets`) |

## Fase 3 — Prova de ponta a ponta e fechamento

> 🤖 Modelo: `sonnet` (T3.3 → `haiku`)

| Task | O quê | Aceite |
|---|---|---|
| T3.1 | E2E (`make panel-e2e`, Edge): `POST /analyst-decision` no servidor de controle (linha + `pg_notify`), a sala anima a vela nova sem recarregar; com `reducedMotion: 'reduce'` aparece pronta | E2E verde, zero violação de CSP |
| T3.2 | Revisão de design a 375 e 1280 px nos dois temas contra o preview `docs/preview/sala-da-equipe/`; linguagem para leigo (RNF01); **uma** captura final por tema | Capturas em `evidence.md`; divergências corrigidas ou listadas |
| T3.3 | `CLAUDE.md` (pasta `team-room/`, campos novos da view se D4-A, alvos `make`) | Diff revisado |

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/011-sala-da-equipe/ (leia spec.md, plan.md e tasks.md antes de
começar; o preview de referência é docs/preview/sala-da-equipe/index.html e as capturas ao lado). Uma task por vez, na
ordem do tasks.md.
ANTES DE TUDO: confira em specs/011-sala-da-equipe/evidence.md as respostas do usuário às decisões do spec.md §10. Sem
resposta, siga os padrões A, MAS a D4-A (motivo por regra, T1.1) muda o contrato da spec 007 e só acontece com
autorização registrada; sem ela, faça a D4-B (sala sem motivo) e siga.
DEPENDÊNCIA: a spec 007 precisa ter as Fases 2 e 3 prontas (rotas /analyst e /analyst/decisions, Zod e glossário do
painel, AnalystCard). Se não tiver, pare e pergunte na T0.1.
Modelos: Fase 0 → executor model=sonnet · Fase 1 → executor model=sonnet (T1.2 → executor model=haiku) · Fase 2 →
executor model=sonnet · Fase 3 → executor model=sonnet (T3.3 → executor model=haiku) · revisão final → code-reviewer
model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com bun run typecheck + bun run lint + bun run format:check + testes + commit isolado, evidência em
evidence.md. Teste novo do painel entra na lista explícita do script test do package.json do painel.
Rode os gates no Linux/WSL: no Windows, fixtures com new URL(...).pathname quebram (spec 003, plan D6).
A sala SÓ MOSTRA: nenhuma regra do analista muda, nenhum número é calculado no painel além da formatação, toda fala é
frase do servidor (catálogo fechado), nada soa como promessa ou recomendação, aviso fixo da A17 no cartão. Animação só
na vela nova, durações em tokens, prefers-reduced-motion e o botão desligado = estado final instantâneo. Sem biblioteca
nova; CSS Modules + SVG; sem style=.
Tudo simulado: nenhuma ordem real, nenhuma chave de corretora, nada de modo live.
Não toque em specs/007*, specs/008*, specs/009* nem nos arquivos que elas criam, exceto o que a T1.1 autorizada pedir.
Pare e pergunte antes de: deploy, qualquer migration, mudar o motor ou o run-recording, mudar a regra analyst-1,
dependência nova, a T1.1 sem autorização, a 007 ainda em execução por outro executor, qualquer [NEEDS CLARIFICATION].
PROIBIDO: git push, git reset, git commit --amend, git stash, mexer nos containers ativada-dev-*.
UI: verifique por texto (read_page, get_page_text); screenshot só na T3.2.
Ao terminar ou parar, feche o modo (/oh-my-claudecode:cancel).
```


## Fase 2 — Escritório vivo (2026-10-18)

> 🤖 Modelo por task: E0 `haiku` · E1 `sonnet` · E2 `sonnet` · E3 `haiku` · F `sonnet`. Gates no Linux a cada task: `typecheck`,
> `eslint`, `prettier --check`, `panel-test`. Commit isolado por task. Teste novo entra na lista explícita do `package.json`.

| Task | O quê | Aceite |
|---|---|---|
| E0 | Esta seção (spec, plan, tasks) | Decisões V1–V7 registradas |
| E1 | Varanda animada: relógio de cena único, pistas puras, balões em turnos, mãos, papéis, estado no crachá | Contratos: nomes visíveis, só ligadas, um balão por vez (relógio falso) |
| E2 | Aba Escritório isométrica: grade, rotas, roteiro puro, cenário, mesas, telas, agentes que andam | Contratos: sem sobreposição de mesa, volta ao assento, determinístico com semente |
| E3 | Botão Calmo e `prefers-reduced-motion` | Calmo muda o ritmo e é lembrado; movimento reduzido sem classes de movimento |
| F | Revisão: contratos, 375 px, claro/escuro, contraste, alvos 44 px, glossário, `CLAUDE.md`, `evidence.md` | Evidência registrada |

Fora desta fase: lousa com níveis e plaquinha de % líquido (segunda fase; só o ponto de extensão).

## Fase 3 — Sala de operações (aprovada 2026-10-20)

> 🤖 Modelo por task: S0 `haiku` · S1 `sonnet` · S2 `sonnet` · S3 `sonnet` · S4 `sonnet` · S5 `sonnet` · S6 `haiku`. Gates no Linux a cada
> task: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run --cwd apps/frontend-ativada test`. Commit isolado por task.
> Teste novo entra no FIM da lista explícita do `package.json` do painel.

| Task | O quê | Aceite |
|---|---|---|
| S0 | Esta seção (spec, plan, tasks) | Decisões S-D1–S-D8 registradas |
| S1 | Telão-terminal: tokens `--terminal-*`, contexto do terminal, MA20/MA50 (`setAverages`), cabeçalho com par/vela/preço e `PriceVariation` (sai do "Acompanhamento") | Contratos: médias exatas à mão, superfície falsa recebe as médias só no terminal, variações uma vez só; contraste dos pares do terminal |
| S2 | `trade-plan` no painel (Zod + consulta), níveis do plano no telão e `room-opinions.ts` | Contratos: as três formas do servidor, valor fora do contrato recusado, níveis do plano, linhas de cada agente com o texto formatado, equipe desligada fora |
| S3 | Pixel art (avatares, mobília, mesas com monitores) e a parede de telas | Contratos: desenho determinístico, contorno, cena `aria-hidden`, Fear & Greed com crédito, mapa de calor dos pares habilitados |
| S4 | Vida no escritório: roteiro com semente, reunião na troca da decisão, Calmo e movimento reduzido | Contratos (relógio falso): determinístico, passo ≤ 1 ladrilho, fora da área do telão, reunião e volta ao assento, nada agendado com Calmo/movimento reduzido |
| S5 | Página: a sala troca varanda, plaquinhas e seção da sala em `LiveChartArea`; 375 px; lista "O que cada um acha"; `aria-live` único; código morto apagado | Contratos de página; `design-review`, `contrast`, `touch-targets` verdes |
| S6 | `CLAUDE.md` (painel) e `evidence.md` | Diff revisado |
