# Plano — Spec 011

Fatos conferidos em 2026-10-15 (não repetir a busca):

- **Contrato de origem**: ADR 0002, seção "Analista de risco (spec 007)": `AnalystDecision` (A16), frases (A17, tabela
  "Frases do analista"), rotas e `AnalystDecisionView` (A20), situação do auditor e peso (A7), equipe e "sem previsão"
  (A12), postura (A13). A sala não muda nenhuma regra: só lê `current`, `locks`, `goalProgress` e a página de decisões.
- **Estado da 007 em 2026-10-15**: T0.1, T0.2, T1.1 e T1.2 prontas (`packages/risk-analyst`); a Fase 2 (gravar, worker) e
  a Fase 3 (rotas e painel) **não existem ainda**; outro executor está nela. A T2.1 (migration `analyst_decisions`) espera
  autorização (D3 da 007).
- **Motivo por regra**: `apps/api-ativada/src/runs/live-status/decision-condition.ts` (`describeRuleCondition`, spec 008 L15)
  já tem as frases de "contra" e "neutro" das 7 regras; não tem "a favor" (a 008 só explica espera). `AnalystDecision`
  guarda só o voto do especialista (sinal do placar), não o voto de cada regra.
- **Painel**: React 19, CSS Modules, tokens em `apps/frontend-ativada/src/styles/global.css` (já tem `--motion-fast` 160 ms
  e `--ease-out`; o bloco `prefers-reduced-motion` na linha ~126). Contratos que já valem para tudo: `design-review`
  (sem `style=`, `transition`/`animation` só com `prefers-reduced-motion`), `contrast` (pares de cor nos dois temas),
  `touch-targets` (44 px). O glossário (`src/glossary/`, `Term`) ganha os termos da 007 na T3.2 dela.
- **Preview**: `docs/preview/sala-da-equipe/index.html` (autônomo, sem CDN) é a referência visual; capturas em
  `docs/preview/sala-da-equipe/capturas/` (Edge + `playwright-core` do repo).

## D1. Onde mora cada peça

| Peça | Lugar | Por quê |
|---|---|---|
| Frases do motivo (§5 da spec) e `ruleVotes` | `packages/risk-analyst/src/analyst-messages.ts` + `specialist-team.ts` (só com D4-A) | Catálogo fechado único (A17); o voto por regra já sai do `signalStep` que o especialista roda |
| Campo `motive` na view | `apps/api-ativada/src/runs/analyst/` (a view da A20) | O servidor monta a frase; o painel não traduz regra |
| Sala | `apps/frontend-ativada/src/runs/analyst/team-room/` | Ao lado do `AnalystCard` da 007 |
| Movimento | `team-room-timeline.constant.ts` (atrasos) + tokens `--motion-*` no CSS | Um número em um lugar; durações só em token |

Arquivos do painel (cada um ≤ 200 linhas, componente ≤ 40):

| Arquivo | O quê |
|---|---|
| `TeamRoomCard.tsx` | Cartão: cabeçalho (selo da vela, selo da sombra, Repetir, Animação, recolher), estados de carga/erro/indisponível |
| `TeamRoomStage.tsx` | Palco `aria-hidden`: piso, especialistas, analista, auditor (só posiciona) |
| `SpecialistSeat.tsx` | Bonequinho + balão + plaquinha de um especialista |
| `AnalystSeat.tsx`, `AuditorSeat.tsx` | Os dois da frente |
| `TeamFigure.tsx` | O SVG do bonequinho (papel → roupa e acessório por classe) |
| `SpeechBubble.tsx`, `AuditorPlacard.tsx` | Balão (normal, quieto, votou) e plaquinha |
| `AuditorClipboard.tsx` | Prancheta: barras de Wilson contra 50% |
| `TeamRoomLines.tsx` | `<details>` "Falas desta vela em texto" + `<p aria-live>` |
| `TeamRoomNavigator.tsx` | ← Vela anterior / Próxima vela → / Voltar para agora |
| `team-room-view.ts` | Puro: de `AnalystDecisionView` para `SeatView[]` (voto, quieto/votou, textos já prontos) |
| `use-team-room-sequence.ts` | Hook: estado por personagem (`idle`/`thinking`/`spoken`), timers com limpeza, `matchMedia` |
| `team-room-timeline.constant.ts` | `TEAM_ROOM_TIMELINE = { thinkMilliseconds: 450, betweenMilliseconds: 150, analystThinkMilliseconds: 250, analystSpeakMilliseconds: 300, announceAfterMilliseconds: 200 }` |
| `team-room.module.css` | Container query (lista < 640 px, sala ≥ 640 px), piso isométrico, balões, keyframes sob `prefers-reduced-motion: no-preference` |
| `team-room-preference.ts` | `localStorage` (try/catch): sala recolhida e animação desligada; nada da simulação |

## D2. Do servidor à sala (`team-room-view.ts`, puro)

Entrada: `AnalystDecisionView` (A20) já validada por Zod. Saída por personagem:

| Campo | Regra |
|---|---|
| `voteKind` | `isUnread` → `unread`; `vote` 1 → `favor`, −1 → `contra`, 0 → `neutro` |
| `tone` | `verdict ≠ above` → `quiet`; `verdict = above` e `vote ≠ 0` → `voter`; senão `normal` |
| `accuracyText` | `counted ≥ 30`: "{hitRate}% ({hits} de {counted})" com vírgula deslocada no texto (`BigInt`, 2 casas para baixo, como a 009); abaixo: "— ({counted} contadas)" |
| `weightText` | `weight = '0'` → "não vota"; senão "peso {x}" (2 casas para baixo) |
| `verdictText` | a frase da A7 que vem do servidor (`specialists[].verdictLabel`, campo da view) |
| `motive` | `specialists[].motive` (D4-A) ou ausente (D4-B: o balão omite a linha) |

O analista usa `postureLabel`, `message`, `reasonMessage`, `lockMessages`; o auditor usa só `specialists` (incluindo
`key: 'strategy'` como "Tendência da estratégia" + "não vota"). Nenhum número é recalculado.

## D3. Sequência (`use-team-room-sequence.ts`)

- Dispara só quando `current.candleTime` muda **depois** da primeira renderização (o primeiro valor e a vela revista vão
  direto ao estado final). Guarda o último `candleTime` animado num `useRef`.
- Ordem: selo da vela → todos os especialistas `thinking` → `spoken` um a um (ordem da A16) a cada `betweenMilliseconds`
  → o que votou recebe a classe do anel uma vez → analista `thinking` → `spoken` → texto do `aria-live`.
- `prefers-reduced-motion: reduce` (por `matchMedia`, com assinatura de mudança) ou preferência "Animação desligada" →
  tudo `spoken` no mesmo quadro e o `aria-live` na hora.
- Desmontar, trocar de vela no meio ou nova vela chegando no meio: limpa os timers e recomeça (nunca dois laços).
- Os keyframes moram no CSS dentro de `@media (prefers-reduced-motion: no-preference)` e animam só `opacity` e
  `transform`.

## D4. Motivo por regra (D4-A, só com autorização — T1.1)

- `specialist-team.ts` passa a devolver, por especialista, `ruleVotes: [{ ruleId, vote, reading }]` (os votos que o
  `signalStep` já calcula; `reading` = RSI ou Fear & Greed, como na 008), em `AnalystDecision.specialists[]`.
- `analyst-messages.ts` ganha `describeSpecialistMotive({ specialist, ruleVotes, isUnread })` com as frases da §5 da spec;
  as de "contra"/"neutro" vêm do MESMO texto da 008 (mover `describeRuleCondition` para um lugar compartilhado não é desta
  spec: o pacote repete o texto e um contrato prova igualdade literal com a 008).
- A view (A20) ganha `motive` e `verdictLabel` em cada especialista. A decisão (postura, tamanho, comandos) não muda:
  dourado `analyst-1` regravado só no campo novo, com prova de que o resto é igual byte a byte.
- Com a migration da 007 já aplicada, `ruleVotes` vai no `jsonb` `specialists` (sem migration). Decisões antigas sem
  `ruleVotes` → `motive` ausente (o balão omite a linha).

## D5. Testes

- Puro: `team-room-view` (todos os votos, tons, bordas 29/30 contadas, peso 0, `strategy`), frases literais de interface
  e a varredura de palavras proibidas.
- Hook: relógio falso (temporizadores injetados por parâmetro, como o `StreamClient`), ordem dos estados, `aria-live` uma
  vez, `prefers-reduced-motion` e preferência desligada, limpeza no desmonte e na troca de vela.
- Componentes (`renderApp` + `fake-fetch` com a fixture da 007): cada estado da A20, quieto/votou, lista de texto igual ao
  palco, palco `aria-hidden` sem focável, navegação de velas, recolher lembrado.
- Design: `design-review` (sem `style=`, movimento sob `prefers-reduced-motion`), `contrast` (borda do balão que votou e
  ladrilho aceso ≥ 3:1; textos ≥ 4,5:1 nos dois temas), `touch-targets` (Repetir, Animação, ←/→, recolher).
- E2E (`make panel-e2e`, Edge): vela nova pelo `pg_notify` do servidor de controle (rota `POST /analyst-decision` nova no
  harness, mesmo padrão de `POST /decision`) e a sala muda sem recarregar.
- Com D4-A: contrato do motivo × `ruleVotes` nos conjuntos reais e igualdade literal com `describeRuleCondition`.

## D6. Gates

`bun run typecheck` + `bun run lint` + `bun run format:check` + testes (`make check`, o script `test` do painel com os
arquivos novos na lista explícita) + commit isolado + evidência em `evidence.md`. Rodar no Linux/WSL (espelho em disco
Linux; spec 003 plan D6). Nenhuma dependência nova.


## Fase 2: escritório vivo — plano (2026-10-18)

Pasta nova `apps/frontend-ativada/src/runs/team-room/motion/` (compartilhada) mais arquivos em `balcony/` e `office/`.

| Peça | Arquivo | O quê |
|---|---|---|
| Ritmo | `motion/motion-rhythm.ts` | `RHYTHM.lively` (ocioso 2–9 s, reunião 20 s, turno 3,2 s) e `RHYTHM.calm` (×2) |
| Semente | `motion/seeded-random.ts` | Gerador determinístico (mulberry32) |
| Relógio da cena | `motion/cue-runner.ts` | Executa uma lista de pistas com UM temporizador pendente; temporizador injetável (relógio falso) |
| Contexto do relógio | `motion/MotionClock.context.tsx` | Padrão real; o teste injeta o falso |
| Movimento reduzido | `motion/useReducedMotion.hook.ts` | `matchMedia` com assinatura |
| Calmo | `motion/calm-store.ts` + `useCalm.hook.ts` + `CalmButton.component.tsx` | Preferência em `localStorage` (try/catch), compartilhada entre varanda e escritório |
| Varanda | `balcony/balcony-script.ts`, `useBalconyScene.hook.ts` | Pistas puras (quem fala, gesto) e o hook; atributos `data-speaking`/`data-gesture` |
| Planta | `office/office-grid.ts` | Grade 14 × 10, mesas, assentos, pontos (mesa da Alice, quadro) |
| Rotas | `office/office-route.ts` | BFS na grade, sem células de mesa |
| Roteiro | `office/office-script.ts` | Viagens (ocioso/reunião) como dado puro, com semente |
| Cena | `office/useOfficeWalk.hook.ts` | Uma pista por passo; posição por classes `x-N`/`y-N` |
| Cenário | `office/IsoOffice*.component.tsx`, `IsoOffice.module.css` | Piso, paredes, janela, quadro, relógio, plantas, mesas, telas |

Fluxo: `useReducedMotion` + animação ligada + aba visível → `isMoving`. Sem `isMoving` nada agenda e nada leva atributo de movimento.

### Modelo por task

E0 documentos → haiku; E1 varanda → sonnet; E2 aba Escritório → sonnet; E3 Calmo e movimento reduzido → haiku; F revisão → sonnet.
