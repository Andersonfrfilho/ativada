# Evidência — Spec 011

## Decisões do usuário (spec §10)

_Sem resposta registrada._

## Respostas do usuário às decisões do spec.md §10 (registro de 2026-10-15)

O usuário (Anderson) respondeu "pode seguir" às escolhas recomendadas: D1-A (cartão próprio recolhível), D2-A (animação só
na vela nova, com botão de desligar), D3-A (plaquinha com a situação real do auditor), D4-A (motivo curto por regra no
balão; muda o contrato da spec 007 e só começa com a Fase 3 da 007 fechada), D5-A (personagens em SVG), D6-A (janela de
30 dias) e D7-A (rever velas anteriores).

Pedido adicional do usuário: a equipe também deve aparecer NA TELA DO GRÁFICO (versão compacta ao lado do gráfico,
"Próxima vela de perto"), ajudando a enxergar as decisões. Regra: a sala mostra a opinião e o motivo de cada agente; quem
decide continua sendo o analista na simulação, e a tela nunca fala em nome do usuário nem soa como recomendação.

Pedido adicional (2026-10-15, "ou o gráfico na sala"): além da versão compacta da equipe ao lado do gráfico, deve existir o
modo inverso, a sala com o gráfico dentro dela (um "monitor" na parede da sala de negociação, com os balões apontando
para a vela e a linha que cada agente comenta). Os dois modos são uma única escolha de layout (alternância "Gráfico +
equipe" / "Sala com o gráfico"), com o mesmo conteúdo e as mesmas frases do servidor. Entra como decisão D8 do spec 011
(padrão: A = alternância com os dois modos; B = só um deles) a detalhar na T0.1 da 011, após a Fase 3 da spec 007.

## Versão 1 sem o analista (2026-10-15)

Pedido do usuário: ver a sala já, sem esperar o analista de risco da spec 007. A versão 1 usa SÓ dados que existem hoje
(`live-status`, `decisions` e o resumo de `projections`); nada da 007 (rotas, `ruleVotes`, migration, worker) foi tocado.
Decisões aplicadas: D1-A (cartão próprio recolhível), D2-A (animação só na vela nova, com botão), D3-A (plaquinha com a
situação real), D5-A (SVG), D6-A, D7-A (rever velas) e D8 (alternância "Gráfico + equipe" / "Sala com o gráfico"). D4-A (motivo
por regra via `ruleVotes`) fica fora: o balão usa a frase que o servidor já manda por regra em `triggers.rules[].message`
(só na vela mais recente) e, nas velas revistas, o voto e a leitura gravados na decisão.

### De onde vem cada fala (nenhuma é inventada)

| Na tela | Fonte |
|---|---|
| Os "especialistas" (Tendência, Reversão, Volume, Sentimento, "Outras regras") | regras de `decisions.items[0].votes`, agrupadas pela família do `kind` (vocabulário do ADR 0002); só aparece a família que a estratégia tem |
| Voto, peso e "leitura" | `votes[].vote`, `weight`, `isMissing`, `reading` |
| Frase do balão | `triggers.rules[].message` (servidor) |
| "Resumo do placar da estratégia" (no lugar do analista) | `outcome` (Esperou, Comprou, Vendeu…), `score` contra `scoreThreshold` e `message` da decisão |
| Auditor | `summary` de `GET /projections`: `verdict`, `hits`/`counted`, `wilson`, `message`, `verdictMessage`; "moeda ao ar" 50,00% |
| Textos de interface (não são falas) | "Sala da equipe", "Repetir", "Animação", "← Vela anterior", "Voltar para agora", legenda, "A equipe não tem opinião nesta vela…", "Sem simulação rodando agora…" |

Estado é ícone + palavra + cor (a favor ↗, contra ↘, neutro =, sem leitura ⓘ; "votou", "sem voto", "fora do placar").

### Tasks e commits

| Task | Commit |
|---|---|
| T1 modelo (famílias, tons, plaquinha, auditor), sequência pura, preferência, glossário | `84f3a3d` |
| T2 palco (SVG, balões, plaquinhas, piso, tokens) | `12a651d` |
| T3 cartão, sequência na vela nova, rever velas, lista de texto, equipe compacta | `ff11428` |
| T4 alternância de layout e ligação no detalhe da simulação ao vivo | `8ba3ea1` |

### Provas

- Contratos novos na lista explícita do script `test`: `team-room-model.contract.ts` (15) e `team-room.contract.tsx` (17: vela nova,
  equipe sem opinião, auditor com menos de 30 previsões, sem simulação rodando, palco `aria-hidden` sem focável, lista de texto
  = palco, animação só na vela nova com `aria-live` uma vez, animação desligada, `prefers-reduced-motion`, rever velas,
  recolher, alternância de layout, equipe compacta, varredura de palavras proibidas e nenhum `Number(`).
- Contraste: pares novos em `contrast.contract.ts` (bordas 3:1) nos dois temas; alvos de 44 px em `touch-targets.contract.ts`
  (`.tool`, `.switchButton`, `.linesSummary`); `design-review` sem `style=` e com `prefers-reduced-motion` em todo CSS com movimento.
- Sequência: pensa 450 ms, um especialista a cada 120 ms, o resumo pensa 250 ms e fala 300 ms, anúncio 200 ms depois; o contrato
  prova ≤ 1,8 s até com 5 lugares. Durações das animações só em tokens (`--motion-fast`, `--motion-medium`, `--ease-out`).
- App dev real (`/backtests/01a14175-02ae-73ae-ba93-86c0591f7a2c`), por texto: estratégia com Reversão (RSI, Bollinger) e Volume
  (OBV); sem rolagem horizontal a 1280 e 375 px; zero focável no palco; "Equipe agora" ao lado de "Próxima vela de perto";
  "Sala com o gráfico" põe o gráfico no monitor da sala e a escolha fica no `localStorage`; auditor com "Poucas previsões"
  (19 contadas). Captura final: `capturas/versao-1-1280-claro.png`.

![Sala da equipe, versão 1](capturas/versao-1-1280-claro.png)

### Pendências (versão 1)

- Falas finais do analista de risco (postura, ritmo, tamanho, travas, "Modo sombra") e `ruleVotes`/`motive` por regra: dependem
  da 007 (Fases 2 e 3) e entram na spec 011 completa.
- Plaquinha com acerto por especialista e prancheta com o intervalo de Wilson por barra: o servidor só mede a estratégia inteira
  hoje; a versão 1 mostra o resumo do auditor em texto.
- Capturas por tema a 375 px e E2E com `pg_notify` (T3.1 e T3.2 da spec completa).
